package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/001_installation/002_disc_installDiscovery.feature" })
public class DISC_install_discovery_IT extends BaseTest{

    public DISC_install_discovery_IT() {}

    @Test(enabled = true, groups = {"install_discovery"})
    public void DISC_install_discovery() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

}
