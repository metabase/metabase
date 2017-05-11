
import {
    describeE2E,
    ensureLoggedIn
} from "../support/utils";

jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

import { startNativeQuestion, saveQuestion, logout } from "../support/metabase";

async function setCategoryParameter(value) {
    // currently just selects the first parameter
    await this.select(":react(Parameters) a").wait().click()
    await this.select(":react(CategoryWidget) li:contains(" + value + ")").wait().click();
    return this;
}

async function checkScalar(value) {
    await this.sleep(250);
    await this.select(".ScalarValue :react(Scalar)").waitText(value);
    return this;
}

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "56";
const COUNT_GADGET = "43";

describeE2E("parameters", () => {
    beforeEach(async () => {
        await ensureLoggedIn(server, driver, "bob@metabase.com", "12341234");
    });

    describe("questions", () => {
        it("should allow users to enable public sharing", async () => {
            // load public sharing settings
            await d.get("/admin/settings/public_sharing");
            // if enabled, disable it so we're in a known state
            if ((await d.select(":react(SettingsSetting) .flex .text-bold").wait().text()) === "Enabled") {
                await d.select(":react(SettingsSetting) :react(Toggle)").wait().click();
            }
            // toggle it on
            await d.select(":react(SettingsSetting) :react(Toggle)").wait().click();
            // make sure it's enabled
            await d.select(":react(SettingsSetting) .flex .text-bold").waitText("Enabled");
        })
        it("should allow users to enable embedding", async () => {
            // load embedding settings
            await d.get("/admin/settings/embedding_in_other_applications");
            try {
                // if enabled, disable it so we're in a known state
                await d.select(":react(Toggle)").wait().click();
            } catch (e) {
            }
            // enable it
            await d.select(".Button:contains(Enable)").wait().click();
            // make sure it's enabled
            await d.select(":react(SettingsSetting) .flex .text-bold").waitText("Enabled");
        });
        it("should allow users to create parameterized SQL questions", async () => {
            await d::startNativeQuestion("select count(*) from products where {{category}}")

            await d.sleep(500);
            await d.select(".ColumnarSelector-row:contains(Field)").wait().click();
            await d.select(".PopoverBody .AdminSelect").wait().sendKeys("cat");
            await d.select(".ColumnarSelector-row:contains(Category)").wait().click();

            // test without the parameter
            await d.select(".RunButton").wait().click();
            await d::checkScalar(COUNT_ALL);

            // test the parameter
            await d::setCategoryParameter("Doohickey");
            await d.select(".RunButton").wait().click();
            await d::checkScalar(COUNT_DOOHICKEY);

            // save the question, required for public link/embedding
            await d::saveQuestion("sql parameterized");

            // open sharing panel
            await d.select(".Icon-share").wait().click();

            // open application embedding panel
            await d.select(":react(SharingPane) .text-purple:contains(Embed)").wait().click();
            // make the parameter editable
            await d.select(".AdminSelect-content:contains(Disabled)").wait().click();
            await d.select(":react(Option):contains(Editable)").wait().click();
            await d.sleep(500);
            // publish
            await d.select(".Button:contains(Publish)").wait().click();

            // get the embed URL
            const embedUrl = (await d.select(":react(PreviewPane) iframe").wait().attribute("src")).replace(/#.*$/, "");

            // back to main share panel
            await d.select("h2 a span:contains(Sharing)").wait().click();

            // toggle public link on
            await d.select(":react(SharingPane) :react(Toggle)").wait().click();

            // get the public URL
            const publicUrl = (await d.select(":react(CopyWidget) input").wait().attribute("value")).replace(/#.*$/, "");

            // logout to ensure it works for non-logged in users
            d::logout();

            // public url
            await d.get(publicUrl);
            await d::checkScalar(COUNT_ALL);
            await d.sleep(1000); // making sure that the previous api call has finished

            // manually click parameter
            await d::setCategoryParameter("Doohickey");
            await d::checkScalar(COUNT_DOOHICKEY);
            await d.sleep(1000);

            // set parameter via url
            await d.get(publicUrl + "?category=Gadget");
            await d::checkScalar(COUNT_GADGET);
            await d.sleep(1000);

            // embed
            await d.get(embedUrl);
            await d::checkScalar(COUNT_ALL);
            await d.sleep(1000);

            // manually click parameter
            await d::setCategoryParameter("Doohickey");
            await d::checkScalar(COUNT_DOOHICKEY);
            await d.sleep(1000);

            // set parameter via url
            await d.get(embedUrl + "?category=Gadget");
            await d::checkScalar(COUNT_GADGET);
        });
    });
});
