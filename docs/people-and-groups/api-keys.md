---
title: API keys
---

# API keys

Metabase can create API keys to authenticate programmatic requests to the API. To set the permissions for an API key, you can assign the key to a [group](./managing.md#groups).

## Fair warning about Metabase's API

We don't version the [Metabase API](../api-documentation.md). We rarely change API endpoints, and almost never remove them, but if you write code that relies on the API, there's a chance you might have to update your code in the future.

That said, there are times when it's nice to work with the API, like when managing permissions with a large number of people and groups, or bulk archiving, or content creation. So we added the ability to create API keys to authenticate your programmatic requests.

## Create an API key

To create an API key:

1. Click on the **gear** icon in the upper right.
2. Select **Admin settings**.
3. Go to the **Settings** tab.
4. Click on the **Authentication** tab on the left menu.
5. Scroll to **API Keys** and click **Manage**.
6. Click the **Create API Key** button.
7. Enter a **Key name**. You can have multiple API keys, so give it a name that will help you remember what you're using the key for.
8. Select a **[Group](./managing.md#groups)**. The key will have the same permissions granted to that group.
9. Click **Create**.
10. Copy the generated API key and save it somewhere safe. Metabase won't be able to show you the key again. If you lose the key, you'll need to regenerate a new key.

## Managing API Keys

To view and manage existing API keys:

1. Click on the **gear** icon in the upper right.
2. Select **Admin settings**.
3. Go to the **Settings** tab.
4. Click on the **Authentication** tab on the left menu.
5. Scroll to **API Keys** and click **Manage**.

### Editing API keys

To edit an API key, scroll to the key you want to edit and click on the **pencil** icon. Metabase will pop up an **Edit API Key** modal where you can edit:

- The key's name
- Which group the key belongs to.
- Change (regenerate) the key. Metabase will replace the existing API key with a new key. You won't be able to recover the old key.

### Deleting API keys

You won't be able to recover a deleted API key. You'll have to create a new key.

To delete an API Key:

1. Click on the **gear** icon in the upper right.
2. Select **Admin settings**.
3. Go to the **Settings** tab.
4. Click on the **Authentication** tab on the left menu.
5. Scroll to **API Keys** and click **Manage**.
6. Select the key you want to delete and click the **trash** icon.
7. Metabase will pop up a **Delete API Key** modal. Click the **Delete API Key** button.

### Metabase will transfer API keys associated with a group that gets deleted to the All users group

If you have API keys assigned to a group, but then someone deletes that group, the API keys will still work, but Metabase will reassign those keys to the All users group. If you want to change their group, you'll need to edit the keys manually.

## Example `GET` requests

Here are some example `GET` requests that return the groups in your Metabase. These examples assume you're running Metabase locally on the default port: 3000.

### `curl` example

Replace `YOUR_API_KEY` with the API key you generated above.

```sh
curl \
-H 'x-api-key: YOUR_API_KEY' \
-X GET 'http://localhost:3000/api/permissions/group'
```

### JavaScript example

Assuming you've set your key as an environment variable like so:

```sh
export METABASE_API_KEY="YOUR_API_KEY"
```

Here's a basic `GET` request using `fetch` to get the list of groups. You can copy the code, save it as file (e.g., as `api-test.js`), and run the code with `node api-test.js`.

```js
// Assuming you've set the key in process with
// `export METABASE_API_KEY="YOUR_KEY_HERE"`
const API_KEY = process.env.METABASE_API_KEY;

const init = {
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY,
  },
};

const host = "http://127.0.0.1:3000";

async function getGroups() {
  const response = await fetch(`${host}/api/permissions/group`, init);
  return response.json();
}

getGroups().then(groups => console.log("Groups in your Metabase:", groups));
```

## Further reading

- [Metabase API reference](../api-documentation.md).
- [Working with the Metabase API](https://www.metabase.com/learn/administration/metabase-api).
