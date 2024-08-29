// v1.4

const puppeteer = require('puppeteer');

(async () => {
    const DIR = {
        // Removed email and password since SSO is used
        login_url: 'https://app.educationperfect.com/app/login',

        // task-starter page elements
        baseList_css: 'div.baseLanguage',
        targetList_css: 'div.targetLanguage',
        start_button_css: 'button#start-button-main',

        // task page elements
        modal_question_css: 'td#question-field',
        modal_correct_answer_css: 'td#correct-answer-field',
        modal_user_answered_css: 'td#users-answer-field',
        modal_css: 'div[uib-modal-window=modal-window]',
        modal_backdrop_css: 'div[uib-modal-backdrop=modal-backdrop]',

        question_css: '#question-text',
        answer_box_css: 'input#answer-text',

        exit_button_css: 'button.exit-button',
        exit_continue_button_css: 'button.continue-button',

        continue_button_css: 'button#continue-button',
    }

    // launch browser
    puppeteer.launch({
        headless: false,
        defaultViewport: null,
        handleSIGINT: false
    })
        .then(async browser => {
            const page = (await browser.pages())[0];

            // Open EP page for manual SSO login
            await page.goto(DIR.login_url, { waitUntil: 'networkidle2' });
            console.log('Please complete the SSO login manually.');

            // Wait for user to complete login via SSO
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            console.log('SSO login completed.');

            // Proceed to main task page
            await page.waitForSelector(DIR.start_button_css, { timeout: 60000 });

            // ===== Auto-answer code starts here ===== //
            let TOGGLE = false;
            let ENTER = true;
            let fullDict = {};
            let cutDict = {};

            function cleanString(string) {
                return String(string)
                    .replace(/\([^)]*\)/g, "").trim()
                    .split(";")[0].trim()
                    .split(",")[0].trim()
                    .split("|")[0].trim();
            }

            async function wordList(selector) {
                return await page.$$eval(selector, els => {
                    let words = [];
                    els.forEach(i => words.push(i.textContent));
                    return words;
                });
            }

            async function refreshWords() {
                const l1 = await wordList(DIR.baseList_css);
                const l2 = await wordList(DIR.targetList_css);
                for (let i = 0; i < l1.length; i++) {
                    fullDict[l2[i]] = cleanString(l1[i]);
                    fullDict[l1[i]] = cleanString(l2[i]);
                    cutDict[cleanString(l2[i])] = cleanString(l1[i]);
                    cutDict[cleanString(l1[i])] = cleanString(l2[i]);
                }
                console.log('Word Lists Refreshed.');
                await alert('Word Lists Refreshed.');
            }

            async function getModalAnswered() {
                return await page.$$eval('td#users-answer-field > *', el => {
                    let answered = '';
                    el.forEach(i => {
                        if (i.textContent !== null && i.style.color !== 'rgba(0, 0, 0, 0.25)') answered = answered + i.textContent;
                    })
                    return answered;
                });
            }

            async function correctAnswer(question, answer) {
                await page.waitForFunction((css) => {
                    return document.querySelector(css).textContent !== "blau";
                }, {}, DIR.modal_question_css);

                let modalQuestion = await page.$eval(DIR.modal_question_css, el => el.textContent);
                let modalAnswer = await page.$eval(DIR.modal_correct_answer_css, el => el.textContent);
                let modalCutAnswer = cleanString(modalAnswer);
                let modalAnswered = await getModalAnswered();

                await page.$eval(DIR.continue_button_css, el => el.disabled = false);
                await page.click(DIR.continue_button_css);

                fullDict[question] = modalCutAnswer;

                let log = "===== Details after Incorrect Answer: =====\n"
                log = log + `Detected Question: \n => ${question}\n`;
                log = log + `Inputted Answer: \n => ${answer}\n\n`;
                log = log + `Modal Question: \n => ${modalQuestion}\n`;
                log = log + `Modal Full Answer: \n => ${modalAnswer}\n`;
                log = log + `Modal Cut Answer: \n => ${modalCutAnswer}\n`;
                log = log + `Modal Detected Answered: \n => ${modalAnswered}\n\n\n`;

                console.log(log);
            }

            async function deleteModals() {
                await page.$$eval(DIR.modal_css, el => {
                    el.forEach(i => i.remove())
                });
                await page.$$eval(DIR.modal_backdrop_css, el => {
                    el.forEach(i => i.remove())
                });
            }

            function findAnswer(question) {
                let answer = fullDict[question];
                if (answer) return answer;
                answer = fullDict[question.replace(",", ";")];
                if (answer) return answer;
                answer = cutDict[cleanString(question)];
                if (answer) return answer;
                console.log(`No answer found for ${question}`);
                return "idk answer";
            }

            async function answerLoop() {
                if (TOGGLE) throw Error("Tried to initiate answerLoop while it is already running");

                TOGGLE = true;
                console.log("answerLoop entered.");

                while (TOGGLE) {
                    let question = await page.$eval(DIR.question_css, el => el.textContent);
                    let answer = findAnswer(question);

                    await page.click(DIR.answer_box_css, { clickCount: 3 });
                    await page.keyboard.sendCharacter(answer);
                    ENTER && page.keyboard.press('Enter');

                    if (await page.$(DIR.modal_css)) {
                        if (await page.$(DIR.modal_question_css) !== null) {
                            await correctAnswer(question, answer);
                            await deleteModals();
                        } else if (await page.$(DIR.exit_button_css)) {
                            await page.click(DIR.exit_button_css);
                            break;
                        } else if (await page.$(DIR.exit_continue_button_css)) {
                            await page.click(DIR.exit_continue_button_css);
                            break;
                        } else {
                            await deleteModals();
                        }
                    }
                }

                await deleteModals();
                TOGGLE = false;
                console.log('answerLoop Exited.');
            }

            async function toggleLoop() {
                if (TOGGLE) {
                    TOGGLE = false;
                    console.log("Stopping answerLoop.");
                } else {
                    console.log("Starting answerLoop.");
                    answerLoop().catch(e => {
                        console.error(e);
                        TOGGLE = false
                    });
                }
            }

            async function toggleAuto() {
                if (ENTER) {
                    ENTER = false;
                    console.log("Switched to semi-auto mode.");
                    await alert("Switched to semi-auto mode.");
                } else {
                    ENTER = true;
                    console.log("Switched to auto mode.");
                    await alert("Switched to auto mode.");
                }
            }

            async function alert(msg) {
                await page.evaluate(m => window.alert(m), msg);
            }

            await page.exposeFunction('refresh', refreshWords);
            await page.exposeFunction('startAnswer', toggleLoop);
            await page.exposeFunction('toggleMode', toggleAuto);

            await page.evaluate(() => {
                document.addEventListener("keyup", async (event) => {
                    let key = event.key.toLowerCase();
                    if (key !== 'alt') {
                        if ((event.altKey && key === "r") || (key === "®")) {
                            await window.refresh();
                        } else if ((event.altKey && key === "s") || (key === "ß")) {
                            await window.startAnswer();
                        } else if ((event.altKey && key === "a") || (key === "å")) {
                            await window.toggleMode();
                        }
                    }
                });
            });
            console.log('Education Perfected V2 Loaded.');
        });
})();
