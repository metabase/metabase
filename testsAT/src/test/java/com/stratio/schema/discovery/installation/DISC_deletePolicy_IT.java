package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/099_uninstall/002_disc_deletePolicies.feature" },format = "json:target/cucumber.json")
public class DISC_deletePolicy_IT extends BaseTest{

    public DISC_deletePolicy_IT() {}

    @Test(enabled = true, groups = {"delete_policy"})
    public void DISC_deletePolicy() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }
}
