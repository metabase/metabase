package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import com.stratio.qa.data.BrowsersDataProvider;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Factory;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/001_installation/002_disc_installDiscovery.feature" },format = "json:target/cucumber.json")
public class DISC_install_discovery_IT extends BaseTest{

    @Factory(dataProviderClass = BrowsersDataProvider.class, dataProvider = "availableUniqueBrowsers")
    public DISC_install_discovery_IT(String browser) {this.browser = browser;}

    @Test(enabled = true, groups = {"install_discovery"})
    public void DISC_install_discovery() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

}
