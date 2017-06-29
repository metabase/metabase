/**
 * THIS TEST WILL BE DISABLED IN PRODUCTION UNTIL METABASE-LIB IS MERGED
 * (Integrated tests need additional CI setup that I didn't want to copy to this branch)
 */

import {
    login,
    createTestStore
} from "metabase/__support__/integrated_tests";

import React from 'react';
import { mount } from "enzyme";
import { INITIALIZE_DATABASE, initializeDatabase } from "metabase/admin/databases/database";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";

// Currently a lot of duplication with SegmentPane tests
describe("DatabaseEditApp", () => {
    beforeAll(async () => {
        await login();
    })

    // NOTE: These test cases are intentionally stateful
    // (doing the whole app rendering thing in every single test case would probably slow things down)

    it("shows the current settings for sample dataset correctly", async () => {
        const store = await createTestStore()
        store.pushPath("/admin/databases/1");
        const dbEditApp = mount(store.connectContainer(<DatabaseEditApp />));
        await store.waitForActions([INITIALIZE_DATABASE])
    });
});
