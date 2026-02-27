---
title: Actions on dashboards
---

# Actions on dashboards

You can add buttons to dashboards to perform [actions](../actions/start.md) like creating or updating records, and combine them with dashboard [filter](./filters.md).

![Dashboard with filter, action button, and detail card view](./images/dashboard-filter-action.png)

## Create an action

To add an action button to a dashboard, you'll first need to create an action on a model. See [Model actions](../actions/introduction.md).

## Add an action button to a dashboard

Once you [created an action](../actions/introduction.md), you can add a button to a dashboard to perform that action:

1. Visit a dashboard page and click the **pencil** icon to start editing the dashboard.
2. Click on the **box with a mouse pointer** to add an action.

   Metabase will add an action button to the dashboard grid, and open a sidebar with button settings:

   - **Button text**: A label explaining what the button does, e.g., "Add record".
   - **Button variant**: How a button looks. You can select from a variety of handsome buttons:

     ![Button types](./images/buttons.png)

3. Pick an action to connect to the button.
4. For every field in the action, select whether a user should supply the value themselves, or whether the action should use the value from the dashboard filter, see [Connecting an action to a dashboard filter](#connect-an-action-to-a-dashboard-filter).
5. Click **Done**, and **Save** the dashboard.

People viewing the dashboard will not be able to click the button and perform your chosen action:

![Button form](./images/button-form.png)

You can add as many buttons as you want, and wire them up to one or more filters.

## Connect an action to a dashboard filter

When people click the action button on a dashboard, they'll be prompted to input values in the fields defined by that action. Alternatively, you can pre-fill some action fields with the values selected for a dashboard filter. This is useful when a dashboard is filtered by an ID, and the action button should update the same ID.

To connect an action field to a filter on a dashboard:

1. On a dashboard with an action button, click the **pencil icon** edit the dashboard.
2. [Add a filter](./filters.md) to a dashboard, wire it up to any cards that you want to, and click **Done** in the bottom of the sidebar.
3. [Add an action button to the dashboard](#add-an-action-button-to-a-dashboard) (if you haven't already).
4. Hover over the action button and click on the **gear** icon, and select **Change action**.
5. Click on the field's dropdown to select where the action should get it's value and pick a filter to connect to (filters will be referenced in the dropdown by their name):

   ![Wiring up an action button to a dashboard filter](./images/id-value.png)

## Actions are unavailable for public dashboards and dashboards in guest embeds

While you can add actions to dashboards and use them in your Metabase, actions won't work on dashboards accessed via [public links](./introduction.md#sharing-dashboards-with-public-links), or dashboards in guest embeds.

If you want people outside of your Metabase to use an action, you can create a [public form for an action](../actions/custom.md#make-public), or expose actions via [modular embedding](../embedding/modular-embedding.md) with SSO or [full app embedding](../embedding/full-app-embedding.md).

## Further reading

- [Actions](../actions/start.md)
- [Editable tables](../data-modeling/editable-tables.md)
