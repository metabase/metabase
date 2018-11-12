package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.qa.data.BrowsersDataProvider;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Factory;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/001_installation/003_disc_setupDiscovery.feature" },format = "json:target/cucumber.json")
public class DISC_setup_discovery_IT extends BaseTest{

    @Factory(enabled = false, dataProviderClass = BrowsersDataProvider.class, dataProvider = "availableUniqueBrowsers")
    public DISC_setup_discovery_IT(String browser) {
        this.browser = browser;
    }

    @Test(enabled = true, groups = {"setup_discovery"})
    public void DISC_setup_discovery_IT() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

}
