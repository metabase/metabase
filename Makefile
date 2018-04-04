all: compile

change-version:
	bin/change-version.sh $(version)

clean:
	dcos-deployer/bin/clean.sh
	paas-ansible/bin/clean.sh
	paas-cluster-schema/bin/clean.sh
	bin/clean.sh

compile:
	bin/build
	
