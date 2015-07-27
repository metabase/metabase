
## User Manual
### Overview
* What is metabase?
	* Report server
		* a way to ask simple questions
		* a way to save them for later
		* group them into dashboards
		* and share questions + dashboards with others
* History of Metabase
	* Expa custom analytics
	* Worked on our portfolio companies
	* Attempt to allow companies with complicated businesses to push analytics all the way down to folks in tactical roles
	* Saw that we had something and doubled down
* Questions
	* made up of
		* source data - database + table
		* optional filter
		* aggregation clause - bare rows, count, etc
		* group by field or fields
	* can be visualized in a number of ways
		* scalar
		* table
		* charts
		* maps
	* can be saved, favorited or downloaded
* Dashboards
	* made up of multiple cards in a given position
	* used to share groups of questions that should be 

### Asking questions
* Filtering your data
* Understanding how the metric of interest behaves by successive group by's
* Different kinds of metrics
	* bare rows

### Looking at individual rows and their connections
* you can click on ids to see more info about a given person, venue, etc
* you can see all the fields that are hidden for readability
* you can see all connected tables

### Saving questions + dashboards
* what are dashboards?
	* public dashboards contain canonical KPIs, etc
	* personal dashboards can be used for projects and deleted or for long standing areas of interest
* arranging dashboards
	* resizing cards
	* reordering cards
* tips on creating dashboards

### Mapping things
* US State maps
	* default GeoJSON
	* expect states as abbreviations or full names
* Country maps
	* default GeoJSON
	* expect countrys as full names or abbreviations
* Pin maps
	* requires your admin to set up a google maps api key
	* heat maps vs pin maps

### Getting help on your data model
* You can get to the data model reference by clicking on the book icon
* You will see a list of tables
	* pick the table that is relevant to you
		* description
		* see the list of fields
			* description
			* each field has some information about the field as well as easy ways to run queries based on it
			* distinct values
			* bar chart of count grouped by this field
			* line chart of count grouped by this field
