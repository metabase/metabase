---
title: Accessibility in Metabase
redirect_from:
  - /docs/latest/accessibility
  - /docs/latest/people-and-groups/accessibility
---

# Accessibility in Metabase

While we're working to make a product that is easy to use and inclusive to all, we're not yet fully compliant with [the U.S. federal government's Section 508 standards](https://www.section508.gov/) or the [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/) at Level AA. We expect to build on our current state in the future, and as of today these are some general notes on our state of compliance:

- **Navigation and screen readers:** Most information should be accessible to screen readers. Some interactive elements are not operable for screen reader users.
- **Non-text content:** While Metabase provides text alternatives for most non-text elements, some functional images either lack descriptions or have incomplete alt text.
- **Keyboard navigation:** Most form elements are keyboard-accessible, but certain interactive components, such as custom controls and non-modal dialogs, may lack full keyboard operability.
- **Focus management:** Some interactive elements lack a visible focus indicator. A few hidden interactive elements receive the keyboard focus.
- **Tables and data visualization:** Data tables do not consistently include programmatically defined row and column headers, impacting screen reader interpretation.
- **Motion and animations:** Metabase includes minimal transition animations. If the [prefers-reduced-motion CSS setting](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion#user_preferences) is enabled in the OS, Metabase disables animations. However, we have not yet conducted full testing to confirm that all animations meet the recommended flicker rate threshold (between 2 Hz and 55 Hz).
- **Labels:** Some form elements lack explicit labels. Few button labels and form fields are inappropriate and incomplete.
- **Assistive technology compatibility:** Metabase is a React-based web application, which means it requires JavaScript to function and may not be fully operable with all assistive technologies.
- **Contrast and visual accessibility:** While most UI elements meet contrast requirements, some text and interactive elements have insufficient color contrast, making them difficult to read for users with low vision or color blindness.
- **Resizing and responsive behavior:** Most content can be resized up to 200% without loss of information, but some elements do not reflow properly, potentially causing overlap or cutoff content when text spacing is adjusted.
- **Status messages and notifications:** While some dynamically generated status messages are accessible, others are not consistently conveyed to assistive technologies like screen readers, which could make it difficult for users to receive important system feedback.
- **Consistent page titles and headings:** Some pages lack descriptive or unique titles, which may make navigation more challenging for screen reader users who rely on clear page identification.

If you're interested in helping us address these gaps, check out [our developers' guide](../developers-guide/start.md).

To request a copy of our VPAT, contact us at [help@metabase.com](mailto:help@metabase.com).
