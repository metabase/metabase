package com.stratio.schema.discovery.connections;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.qa.data.BrowsersDataProvider;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Factory;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/002_connections/002_disc_connectionXD.feature" },format = "json:target/cucumber.json")
public class DISC_connectionXD_IT extends BaseTest{

    @Factory(enabled = false, dataProviderClass = BrowsersDataProvider.class, dataProvider = "availableUniqueBrowsers")
    public DISC_connectionXD_IT(String browser) {
        this.browser = browser;
    }

    @Test(enabled = true, groups = {"connection_XD"})
    public void DISC_connectionXD() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }
}
