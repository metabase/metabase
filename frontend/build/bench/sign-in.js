/* eslint-env node */

/**
 * Waits for a Metabase to come up, signs in, and prints the session token.
 *
 * A blank instance has no user, so the first run creates one from the setup
 * token. A later run against the same instance signs that user in instead,
 * which is what makes this safe to run again while a backend is still up.
 *
 * The benchmark needs a signed-in document, not content. Nothing here creates a
 * dashboard or a question, because `index.html` is built from settings and the
 * user alone. See `template-parameters` in `metabase.server.routes.index`.
 */

const url = process.argv[2] || "http://localhost:4000";

const EMAIL = "bench@example.com";
// The setup endpoint rejects a password that is short or common.
const PASSWORD = "Benchmark-Passw0rd!";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilReady() {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`);
      const { status } = await response.json();
      if (status === "ok") {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await sleep(1000);
  }
  throw new Error(`No instance came up on ${url}`);
}

async function post(path, body) {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `POST ${path} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
}

(async () => {
  await waitUntilReady();

  const response = await fetch(`${url}/api/session/properties`);
  const properties = await response.json();
  // `setup-token` outlives the setup that used it, so it cannot say whether
  // this instance is blank. `has-user-setup` can.
  const isBlank = !properties["has-user-setup"];

  // Both endpoints answer `{id: <session-key>}`.
  const { id } = isBlank
    ? await post("/api/setup", {
        token: properties["setup-token"],
        user: {
          email: EMAIL,
          password: PASSWORD,
          first_name: "Bench",
          last_name: "Mark",
        },
        prefs: { site_name: "Bench" },
      })
    : await post("/api/session", { username: EMAIL, password: PASSWORD });

  console.error(isBlank ? "created the first user" : "signed the user in");
  process.stdout.write(`${id}\n`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
