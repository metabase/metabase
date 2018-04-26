package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Test;

@CucumberOptions(features = {
        //"src/test/resources/features/installation/001_disc_installPostgres.feature",
        "src/test/resources/features/installation/002_disc_installDiscovery.feature",
        "src/test/resources/features/installation/003_disc_uninstallDiscovery.feature",
        "src/test/resources/features/installation/004_disc_uninstallPostgres.feature"

})
public class DISC_nightly_IT extends BaseTest {

    public DISC_nightly_IT(){}

    @Test(enabled = true, groups = {"nightly"})
    public void nightly() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

}
