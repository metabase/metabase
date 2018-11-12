package com.stratio.schema.discovery.installation;

import com.stratio.qa.cucumber.testng.CucumberRunner;
import com.stratio.tests.utils.BaseTest;
import cucumber.api.CucumberOptions;
import org.testng.annotations.Test;

@CucumberOptions(features = { "src/test/resources/features/001_installation/001_disc_installPostgres.feature" },format = "json:target/cucumber.json")
public class DISC_install_postgres_IT extends BaseTest {

    public DISC_install_postgres_IT() {}

    @Test(enabled = true, groups = {"config_postgres"})
    public void DISC_install_postgres() throws Exception {
        new CucumberRunner(this.getClass()).runCukes();
    }

}
