# ResponseDistribution Settings Organization

## ✅ Final Settings Order

### Data Section (Column Mappings)

Settings appear in this order in the settings panel:

1. **Question title column** _(optional)_

   - The title/question text to display at the top
   - Moved to top since it's the overall context

2. **Option text column** _(required)_

   - The text/labels for each response option
   - Core requirement

3. **Option weight column** _(conditional)_

   - Weights for calculating scores
   - Required only if "Show overall score" is enabled
   - Optional for non-scored visualizations

4. **Response count column** _(required)_

   - Number of responses for each option
   - Core requirement

5. **Total responses column** _(optional)_

   - Total number of responses across all options
   - Will be calculated if not provided

6. **CNA indicator column** _(optional)_

   - Flags "Choose Not to Answer" options
   - Special case handling

---

### Display Section (Presentation Options)

Settings appear in this order in the settings panel:

1. **Show overall score** _(toggle, default: ON)_

   - Controls visibility of the weighted score badge
   - Most fundamental display option
   - When OFF: enables non-scored mode

2. **Use custom order** _(toggle, default: OFF)_

   - Enables custom sorting via the order column
   - When ON: reveals "Order column" dropdown immediately below

3. **Order column** _(conditional)_
   - Column containing numeric values for sorting options
   - Only visible when "Use custom order" is enabled
   - Appears in same section for better UX (no tab switching needed)

---

## Key Improvements Made

### 1. Logical Grouping

- **Data section** = "What data goes where?" (all column mappings)
- **Display section** = "How should it look?" (all visual toggles)

### 2. Priority Ordering

- Most important/fundamental settings appear first
- Conditional settings appear near their parent toggles

### 3. Flexibility for Both Use Cases

- **Scored questions**: Enable "Show overall score" + provide weight column
- **Non-scored questions**: Disable "Show overall score" + weights optional

### 4. Clear Dependencies & Better UX

- "Order column" appears immediately below "Use custom order" toggle (same section, no tab switching)
- "Option weight column" becomes required only when "Show overall score" is enabled
- Related settings are grouped together for intuitive workflows

---

## User Flow Examples

### Setting up a SCORED question (like Lake Prespa):

1. Data section:
   - Select question title column
   - Select option text column ✓
   - Select option weight column ✓ (required for scoring)
   - Select response count column ✓
2. Display section:
   - Keep "Show overall score" ON ✓
   - Result: Shows 66.67 badge + colored segments

### Setting up a NON-SCORED question (like Poltava City):

1. Data section:
   - Select question title column
   - Select option text column ✓
   - Skip option weight column (not needed)
   - Select response count column ✓
2. Display section:
   - Turn "Show overall score" OFF ✓
   - Result: No score badge, just the distribution bar

---

## Future Enhancement Notes

When adding color scheme support later:

- Add "Color scheme" setting to Display section
- Position it after "Show overall score"
- Options: "Weighted scoring" | "Categorical (10 colors)" | etc.
- Make it conditional based on display mode if needed
