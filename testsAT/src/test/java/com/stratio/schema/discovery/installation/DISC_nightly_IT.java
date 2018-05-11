package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import com.stratio.qa.data.BrowsersDataProvider;
import org.testng.annotations.Test;
import org.testng.annotations.Factory;



@CucumberOptions(features = {
        //"src/test/resources/features/installation/001_disc_installPostgres.feature",
        "src/test/resources/features/installation/002_disc_installDiscovery.feature",
        "src/test/resources/features/settings/005_disc_loginUser.feature",
        "src/test/resources/features/configbbdd/010_disc_configbbddPostgressMD5.feature",
        "src/test/resources/features/configbbdd/011_disc_configbbddPostgressTLS.feature",
        "src/test/resources/features/configbbdd/012_disc_configbbddCrossdata.feature",
        "src/test/resources/features/installation/003_disc_uninstallDiscovery.feature",
        "src/test/resources/features/installation/004_disc_uninstallPostgres.feature"

})
public class DISC_nightly_IT extends BaseTest {

    @Factory(enabled = false, dataProviderClass = BrowsersDataProvider.class, dataProvider = "availableUniqueBrowsers")
    public DISC_nightly_IT(String browser) {
        this.browser = browser;
    }

    public DISC_nightly_IT(){}

    @Test(enabled = true, groups = {"nightly"})
    public void nightly() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

  }
