# Is Metabase accessible or 508 compliant?

Metabase strives for accessibility, but is not yet fully 508 compliant. Here is a quick summary of the specific areas where Metabase is not yet entirely compliant:

- The app does not have a method to allow screen readers to skip over repetitive navigation elements.
- Metabase is extremely close but not 100% compliant at providing text equivalents for all non-text elements in the app.
- Not all, but most, of the app's form elements are selectable by tabbing through elements.
- Metabase has minimal transition animations in it, but we have not yet conducted testing to determine the range of flickering to verify if it is always between 2 and 55 hertz.
- The app's data tables do not have row and column headers identified in markup.
- We do not yet have a published description of our accessibility and compatibility features.
- Also note that Metabase is a React-based web application, and cannot function without scripting (i.e., JavaScript) turned on.
