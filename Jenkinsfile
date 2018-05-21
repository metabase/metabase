@Library('libpipelines@master') _

hose {
    EMAIL = 'governance'
    MODULE = 'discovery'
    REPOSITORY = 'discovery'
    SLACKTEAM = 'data-governance'
    BUILDTOOL = 'make'
    DEVTIMEOUT = 30
    RELEASETIMEOUT = 30

    ATTIMEOUT = 90
    INSTALLTIMEOUT = 90

    PKGMODULESNAMES = ['discovery']

    DEV = { config ->
            doDocker(conf: config, skipOnPR: false)
    }

    INSTALLSERVICES = [
            ['DCOSCLI':   ['image': 'stratio/dcos-cli:0.4.15-SNAPSHOT',
                           'volumes': ['stratio/paasintegrationpem:0.1.0'],
                           'env':     ['DCOS_IP=10.200.0.205',
                                      'SSL=true',
                                      'SSH=true',
                                      'TOKEN_AUTHENTICATION=true',
                                      'DCOS_USER=admin@demo.stratio.com',
                                      'DCOS_PASSWORD=1234',
                                      'BOOTSTRAP_USER=operador',
                                      'PEM_FILE_PATH=/paascerts/PaasIntegration.pem'],
                           'sleep':  10]]
        ]

    INSTALLPARAMETERS = """
        | -DDCOS_CLI_HOST=%%DCOSCLI#0
        | -DDCOS_CLI_USER=root
        | -DDCOS_CLI_PASSWORD=stratio
        | -DDCOS_IP=10.200.0.156
        | -DBOOTSTRAP_IP=10.200.0.155
        | -DREMOTE_USER=operador
	    | -DDISC_POSTGRES_VERSION=1.1.3
	    | -DPOSTGRES_DISCOVERY_SERVICE=postgresdisc
	    | -DPOSTGRES_DISCOVERY_FWK_MESOS_ROLE=postgresdisc
        | -DSTRATIO_DISCOVERY_VERSION=0.28.9
        | -DDISCOVERY_NAME_DB=discovery
	    | -DMARATHON_LB_DNS=nightlypublic.labs.stratio.com
	    | -Dquietasdefault=false
        | """.stripMargin().stripIndent()

    INSTALL = { config ->
        if (config.INSTALLPARAMETERS.contains('GROUPS_DISCOVERY')) {
            config.INSTALLPARAMETERS = "${config.INSTALLPARAMETERS}".replaceAll('-DGROUPS_DISCOVERY', '-Dgroups')
            doAT(conf: config)
        } else {
            doAT(conf: config, groups: ['nightly'])
        }
    }
}
