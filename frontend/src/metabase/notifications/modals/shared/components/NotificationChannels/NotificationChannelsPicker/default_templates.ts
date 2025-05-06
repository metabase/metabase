const PRICE_UPDATE_NOTIFICATION_EMAIL = {
  name: "Price Update Notification",
  description: "Highlight if a price has dropped or gone up.",
  body: `<h2>Price Update Notification</h2>

<p><strong>{{record.name}}</strong> had its price updated by {{editor.common_name}} on {{format-date context.timestamp "MMMM dd, yyyy"}}.</p>

{{#if (gt changes.price.before changes.price.after) }}
  <p style="color: red;"><strong>Big Discount!</strong> The price has dropped 🎉</p>
{{else}}
  <p>The price has gone up.</p>
{{/if}}

<p>Old Price: \${{changes.price.before}}</p>
<p>New Price: \${{changes.price.after}}</p>

<p><a href="{{table.url}}">View the record in the database</a></p>`,
};

const ON_SALE_EMAIL = {
  name: "On Sale",
  description: `Show different message if a product status changes to "on sale"`,
  body: `<h2>Product Status Change</h2>

<p>{{editor.common_name}} updated the status of <strong>{{record.name}}</strong> on {{format-date context.timestamp "yyyy-MM-dd 'at' HH:mm"}}.</p>

{{#if (eq changes.status.after "on sale")}}
  <p style="color: green;"><strong>{{record.name}}</strong> is now <em>on sale</em>! Time to boost promotions!</p>
{{else}}
  <p>Status changed to: <strong>{{changes.status.after}}</strong>.</p>
{{/if}}

<p><a href="{{table.url}}">Check the full record</a></p>
`,
};

const RECORD_CREATED_EMAIL = {
  name: "Record created",
  description:
    "Notify when new record is created and mention notification creator",
  body: `<h2>New Record Created</h2>

<p>A new record was added to the <strong>{{table.name}}</strong> table at {{format-date context.timestamp "MMM dd, yyyy HH:mm"}}.</p>

<p>Record Details:</p>
<ul>
  <li><strong>Name:</strong> {{record.name}}</li>
  <li><strong>Price:</strong> \${{record.price}}</li>
  <li><strong>Status:</strong> {{record.status}}</li>
</ul>

<p>This notification was configured by {{creator.common_name}} ({{creator.email}}).</p>

<p><a href="{{table.url}}">View the table</a></p>`,
};

const PRICE_UPDATE_NOTIFICATION_SLACK = {
  name: "Price Update Notification",
  description: "Highlight if a price has dropped or gone up.",
  body: `*Price Update Notification*\n\n*{{record.name}}* had its price updated by {{editor.common_name}} on {{format-date context.timestamp "MMMM dd, yyyy"}}.\n\n{{#if (gt changes.price.before changes.price.after) }}\n*Big Discount!* The price has dropped 🎉\n{{else}}\nThe price has gone up.\n{{/if}}\n\nOld Price: \${{changes.price.before}}\nNew Price: \${{changes.price.after}}\n\n<{{table.url}}|View the record in the database>`,
};

const ON_SALE_SLACK = {
  name: "On Sale",
  description: `Show different message if a product status changes to "on sale"`,
  body: `*Product Status Change*\n\n{{editor.common_name}} updated the status of *{{record.name}}* on {{format-date context.timestamp "yyyy-MM-dd 'at' HH:mm"}}.\n\n{{#if (eq changes.status.after "on sale")}}\n*{{record.name}}* is now _on sale_! Time to boost promotions! 🚀\n{{else}}\nStatus changed to: *{{changes.status.after}}*.\n{{/if}}\n\n<{{table.url}}|Check the full record>`,
};

const RECORD_CREATED_SLACK = {
  name: "Record created",
  description:
    "Notify when new record is created and mention notification creator",
  body: `*New Record Created*\n\nA new record was added to the *{{table.name}}* table at {{format-date context.timestamp "MMM dd, yyyy HH:mm"}}.\n\nRecord Details:\n* *Name:* {{record.name}}\n* *Price:* \${{record.price}}\n* *Status:* {{record.status}}\n\nThis notification was configured by {{creator.common_name}} ({{creator.email}}).\n\n<{{table.url}}|View the table>`,
};

export const DEFAULT_EMAIL_TEMPLATES = [
  PRICE_UPDATE_NOTIFICATION_EMAIL,
  ON_SALE_EMAIL,
  RECORD_CREATED_EMAIL,
];

export const DEFAULT_SLACK_TEMPLATES = [
  PRICE_UPDATE_NOTIFICATION_SLACK,
  ON_SALE_SLACK,
  RECORD_CREATED_SLACK,
];
