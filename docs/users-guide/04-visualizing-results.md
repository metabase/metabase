## Visualizing results
---
While tables are useful for looking up information or finding specific numbers, it's usually easier to see trends and make sense of data overall using charts.

In Metabase, an answer to a question can be visualized in a number of ways:

* Number
* Table
* Line
* Bar
* Pie
* Area
* Maps

A few notes on the map options:
* **States Map** — Creating a map of the United States from your database requires your results to contain a column field with states. GeoJSON is the default output format.  
* **Country Map** — To visualize your results in the format of a map of the world broken out by country, your result must contain a column that contains countries. The default output format is GeoJSON.  
* **Pin Map** — To generate a pin map, your Metabase administrator needs to configure a Google Maps API key, and your data set needs to contain a marked latitude and longitude column.    

To change how the answer to your question is displayed, click on the Visualization dropdown menu beneath the question builder bar.  

![visualizechoices](images/VisualizeChoices.png)

If a particular visualization doesn’t really make sense for your answer, the format option will appear faded in the dropdown menu.  
 
Once a question is answered, you can save or download the answer, or add it to a dashboard. 

Learn more about [Sharing Answers](05-sharing-answers.md) next.