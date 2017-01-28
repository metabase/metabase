
import {
    ensureLoggedIn,
    describeE2E
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

describeE2E("admin/settings", () => {
    beforeEach(() =>
        ensureLoggedIn(server, driver, "bob@metabase.com", "12341234")
    );

    describe("admin settings", () => {
        it("should persist a setting", async () => {
            // pick a random site name to try updating it to
            const siteName = "Metabase" + Math.random();

            // load the "general" pane of the admin settings
            await d.get(`${server.host}/admin/settings/general`);

            // first just make sure the site name isn't already set (it shouldn't since we're using a random name)
            expect(await d.select(".SettingsInput").wait().attribute("value")).not.toBe(siteName);

            // clear the site name input, send the keys corresponding to the site name, then blur to trigger the update
            await d.select(".SettingsInput").wait().clear().sendKeys(siteName).blur();
            // wait for the loading indicator to show success
            await d.select(".SaveStatus.text-success").wait();

            // reload the page
            await d.get(`${server.host}/admin/settings/general`);

            // verify the site name value was persisted
            expect(await d.select(".SettingsInput").wait().attribute("value")).toBe(siteName);
        });
    });
});
