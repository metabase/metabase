export var dashboardCount = 0
export const incrementDashboardCount = () => {
    dashboardCount += 1;
}
export const getLatestDashboardUrl = () => {
    return `/dashboard/${dashboardCount}`
}
export const getPreviousDashboardUrl = (nFromLatest) => {
    return `/dashboard/${dashboardCount - nFromLatest}`
}

export const createDashboardInEmptyState = async () => {
    await d.get("/dashboards");

    // Create a new dashboard in the empty state (EmptyState react component)
    await d.select(".Button.Button--primary").wait().click();
    await d.select("#CreateDashboardModal input[name='name']").wait().sendKeys("Customer Feedback Analysis");
    await d.select("#CreateDashboardModal input[name='description']").wait().sendKeys("For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response");
    await d.select("#CreateDashboardModal .Button--primary").wait().click();

    incrementDashboardCount();
    await d.waitUrl(getLatestDashboardUrl());

}
