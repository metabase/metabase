all: compile

change-version:
	./bin/change-version.sh $(version)

compile:
	./bin/build
	
