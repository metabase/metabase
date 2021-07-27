# Is Metabase accessible or 508 compliant?

Metabase strives to be accessible, but is not yet fully compliant with [the US federal government's Section 508 standard][508-accessibility]. Some specific areas where Metabase we still have work to do include:

- Metabase doesn't have a method to allow screen readers to skip over repetitive navigation elements.
- Metabase is extremely close but not 100% compliant at providing text equivalents for all non-text elements.
- Most of our form elements are selectable by tabbing through elements.
- Metabase has minimal transition animations in it, but we have not yet tested whether the range of flickering is always between 2 and 55 Hertz.
- Metabase's data tables do not have row and column headers identified in markup.
- We do not yet have a published description of our accessibility and compatibility features.
- Since Metabase is a React-based web application, it cannot function without scripting (i.e., JavaScript) turned on.

If you'd like to help us address these accessibility gaps, please see [our developers' guide][developers-guide].

[508-accessibility]: https://section508.gov/
[developers-guide]: /docs/latest/developers-guide.html
