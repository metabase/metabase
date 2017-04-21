export const removeCurrentDash = async () => {
    await d.select(".Icon.Icon-pencil").wait().click();
    await d.select(".EditHeader .flex-align-right a:nth-of-type(2)").wait().click();
    await d.select(".Button.Button--danger").wait().click();
}
