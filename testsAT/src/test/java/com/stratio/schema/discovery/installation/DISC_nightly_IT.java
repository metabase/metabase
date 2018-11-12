package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import com.stratio.qa.data.BrowsersDataProvider;
import org.testng.annotations.Test;
import org.testng.annotations.Factory;



@CucumberOptions(features = {
        "src/test/resources/features/001_installation/000_disc_createPolicies.feature",
        "src/test/resources/features/001_installation/001_disc_installPostgres.feature",
        "src/test/resources/features/001_installation/002_disc_installDiscovery.feature",
        "src/test/resources/features/001_installation/003_disc_setupDiscovery.feature",
        "src/test/resources/features/002_connections/001_disc_connectionPG.feature",
        "src/test/resources/features/002_connections/002_disc_connectionXD.feature",
        //"src/test/resources/features/004_settings/005_disc_loginUser.feature",
        //"src/test/resources/features/004_settings/006_disc_gestionUser.feature",
        //"src/test/resources/features/004_settings/007_disc_gestionBBDD.feature",
        //"src/test/resources/features/004_settings/008_disc_gestionGroups.feature",
        //"src/test/resources/features/005_configbbdd/010_disc_configbbddPostgressMD5.feature",
        //"src/test/resources/features/005_configbbdd/011_disc_configbbddPostgressTLS.feature",
        //"src/test/resources/features/005_configbbdd/012_disc_configbbddCrossdata.feature",
        "src/test/resources/features/099_uninstall/001_disc_uninstallDiscovery.feature",
        "src/test/resources/features/099_uninstall/002_disc_deletePolicies.feature",
        "src/test/resources/features/099_uninstall/003_disc_uninstallPostgres.feature"
},format = "json:target/cucumber.json")
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
