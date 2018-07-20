@Library('libpipelines@master') _

hose {
    EMAIL = 'governance'
    MODULE = 'discovery'
    REPOSITORY = 'discovery'
    SLACKTEAM = 'data-governance'
    BUILDTOOL = 'make'
    DEVTIMEOUT = 30
    RELEASETIMEOUT = 40
    BUILDTOOLVERSION = '3.5.0'
    NEW_VERSIONING = 'true'

    ATTIMEOUT = 90
    INSTALLTIMEOUT = 90

    PKGMODULESNAMES = ['discovery']

    DEV = { config ->
            doDocker(conf: config, skipOnPR: false)
    }

    INSTALLSERVICES = [
            ['DCOSCLI':   ['image': 'stratio/dcos-cli:0.4.15-SNAPSHOT',
                           'env':     ['DCOS_IP=10.200.0.205',
                                      'SSL=true',
                                      'SSH=true',
                                      'TOKEN_AUTHENTICATION=true',
                                      'DCOS_USER=admin',
                                      'DCOS_PASSWORD=1234',
                                      'CLI_BOOTSTRAP_USER=root',
                        	      'CLI_BOOTSTRAP_PASSWORD=stratio'],
                           'sleep':  120,
                           'healthcheck': 5000]]
        ]

    INSTALLPARAMETERS = """
        | -DDCOS_CLI_HOST=%%DCOSCLI#0
        | -DDCOS_CLI_USER=root
        | -DDCOS_CLI_PASSWORD=stratio
        | -DCLUSTER_SSO=nightly.labs.stratio.com
        | -DDCOS_IP=10.200.0.156
        | -DBOOTSTRAP_IP=10.200.0.155
        | -DREMOTE_USER=operador
        | -DDISC_VERSION=0.31.0-SNAPSHOT
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
