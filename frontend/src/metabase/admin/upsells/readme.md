# Upsells Components

The components in the `components/` directory here have been carefully designed, and should not be customized beyond the options they expose. If you are trying to further customize the appearance or behavior of these components, please talk with a designer about adjusting the design system.

## Usage Rules

1. All upsell components and implementations should live in this directory, nowhere else.
2. All upsell implementations should be built using the design system components in the `components/` directory.
3. All exported components in the `components/` should have storybook stories
4. All exports from the `components/` directory should be wrapped in the UpsellWrapper HoC to ensure that the upsell is displayed only to the correct users.
5. All exports from the `components/` directory should use `trackUpsellViewed` and `trackUpsellClicked` to track views and clicks.
6. All upsell links should use the `use-upsell-link` hook within the base components to add appropriate anonymous tracking and analytics.
