export const createDashboardInEmptyState = async () => {
    await d.get("/dashboard");

    // Create a new dashboard in the empty state (EmptyState react component)
    await d.select(".Button.Button--primary").wait().click();
    await d.select("#CreateDashboardModal input[name='name']").wait().sendKeys("Customer Feedback Analysis");
    await d.select("#CreateDashboardModal input[name='description']").wait().sendKeys("For seeing the usual response times, feedback topics, our response rate, how often customers are directed to our knowledge base instead of providing a customized response");
    await d.select("#CreateDashboardModal .Button--primary").wait().click();

    // Make sure that the redirect was successful
    await d.waitUrl("/dashboard/1");
}
