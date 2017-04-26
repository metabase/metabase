
export async function logout() {
    await this.wd().manage().deleteAllCookies();
    return this;
}

export async function startGuiQuestion(text) {
    await this.get("/question");
    return this;
}

export async function startNativeQuestion(text) {
    await this.get("/question");
    await this.select(".Icon-sql").wait().click();
    await this.select(".ace_text-input").wait().sendKeys(text);
    return this;
}

export async function runQuery() {
    await this.select(".RunButton").wait().click();
    return this;
}

export async function saveQuestion(questionName, newDashboardName) {
    // save question
    await this.select(".Header-buttonSection:first-child").wait().click();
    await this.select("#SaveQuestionModal input[name='name']").wait().sendKeys(questionName);
    await this.select("#SaveQuestionModal .Button.Button--primary").wait().click().waitRemoved(); // wait for the modal to be removed

    if (newDashboardName) {
        // add to new dashboard
        await this.select("#QuestionSavedModal .Button.Button--primary").wait().click();
        await this.select("#CreateDashboardModal input[name='name']").wait().sendKeys(newDashboardName);
        await this.select("#CreateDashboardModal .Button.Button--primary").wait().click().waitRemoved(); // wait for the modal to be removed
    } else {
        await this.select("#QuestionSavedModal .Button:contains(Not)").wait().click();
    }

    // wait for modal to close :-/
    await this.sleep(500);

    return this;
}
