package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/099_uninstall/003_disc_uninstallDiscovery.feature" })
public class DISC_uninstall_discovery_IT extends BaseTest {

    public DISC_uninstall_discovery_IT() {}

    @Test(enabled = true, groups = {"purge_discovery"})
    public void DISC_uninstall_discovery() throws Exception{
        new CucumberRunner(this.getClass()).runCukes();
    }

}
