all: compile

change-version:
	chmod 777 ./bin/change-version.sh
	./bin/change-version.sh $(version)

compile:
	./bin/build
	
