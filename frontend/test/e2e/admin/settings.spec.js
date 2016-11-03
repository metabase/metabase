
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
        fit("should persist a setting", async () => {
            const siteName = "Metabase" + Math.random();

            await d.get(`${server.host}/admin/settings/general`);

            expect(await d.select(".SettingsInput").wait().attribute("value")).not.toBe(siteName);

            await d.select(".SettingsInput").wait().clear().sendKeys(siteName).blur();
            await d.select(".SaveStatus.text-success").wait();

            await d.get(`${server.host}/admin/settings/general`);

            expect(await d.select(".SettingsInput").wait().attribute("value")).toBe(siteName);
        });
    });
});
