### UX Evaluation Checklist

For each affected area, evaluate:

- **Visual quality**: Layout correctness, spacing, alignment, typography
- **Interactive behavior**: Buttons, dropdowns, modals work smoothly; no jank
- **Loading states**: Spinner/skeleton while data loads, no flash of empty content
- **Error states**: Clear, helpful error messages when things go wrong
- **Empty states**: Reasonable display when there's no data
- **Keyboard navigation**: Tab through interactive elements, correct focus management
- **Responsive behavior**: Works at different viewport sizes

### Evidence gathering

- Take screenshots at key moments (before/after actions, unexpected states)
- Use descriptive filenames (e.g., `03-dropdown-wont-open.png`, `issue-01-before.png`)
- Always capture the current URL before screenshots
- Note what works well, not just what's broken — reports should be balanced
