import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import * as path from "path";

import { ROOT_FOLDER_PATH } from "../../../constants/paths";

const METABASE_JAR_DIST_PATH = path.join(ROOT_FOLDER_PATH, "target/uberjar");

const EMBEDDING_SDK_DIST_PATH = path.join(
  ROOT_FOLDER_PATH,
  "resources/embedding-sdk",
);

const LOCAL_DIST_PATH = "./local-dist";

// Keep in sync with the H2 version pinned in the root deps.edn (com.h2database/h2).
const H2_VERSION = "2.1.214";
const H2_JAR_URL = `https://repo1.maven.org/maven2/com/h2database/h2/${H2_VERSION}/h2-${H2_VERSION}.jar`;

export function copyExampleEnvFile({
  rootPath,
  dockerEnvExamplePath,
  dockerEnvPath,
}: {
  rootPath: string;
  dockerEnvExamplePath: string;
  dockerEnvPath: string;
}) {
  fs.cpSync(
    path.join(rootPath, dockerEnvExamplePath),
    path.join(rootPath, dockerEnvPath),
  );
}

export function copyLocalMetabaseJar(rootPath: string) {
  const destinationPath = path.join(rootPath, LOCAL_DIST_PATH);

  fs.cpSync(METABASE_JAR_DIST_PATH, destinationPath, { recursive: true });
}

// EE uberjars don't bundle the H2 driver (it's OSS-only; EE expects users to supply it), but the sample apps boot
// Metabase with its default H2 application database. The container launches via the official image's `java -jar`,
// which ignores `-cp`, so we fold the H2 classes directly into the copied metabase.jar.
//
// H2's own META-INF is dropped so its manifest can't clobber the uberjar's (Main-Class) and its signatures don't
// trip jar verification -- but we then MERGE `org.h2.Driver` into the uberjar's existing
// `META-INF/services/java.sql.Driver`. That service registration is required, not cosmetic: the H2 application-DB
// connection is acquired on a c3p0 pool thread, and `java.sql.DriverManager` only hands out drivers whose class is
// visible to the *caller's* classloader. H2 registered lazily by `metabase.driver.h2` (Clojure's dynamic
// classloader) is invisible there, so the pool silently fails to acquire a connection and Metabase aborts boot with
// a 30s checkout timeout. A services entry registers H2 under the system classloader, which the pool thread can see.
// We append (not overwrite) so the uberjar's other bundled driver registrations survive.
//
// Uses curl + zip (no JDK/clojure) because the sample-app CI job doesn't set up a backend toolchain.
export function bundleH2DriverIntoJar(rootPath: string) {
  const jarPath = path.join(rootPath, LOCAL_DIST_PATH, "metabase.jar");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "h2-bundle-"));
  const h2Jar = path.join(workDir, "h2.jar");
  const h2Contents = path.join(workDir, "contents");
  const svcRoot = path.join(workDir, "svc");
  const svcRelPath = "META-INF/services/java.sql.Driver";

  try {
    execSync(`curl -fsSL -o "${h2Jar}" "${H2_JAR_URL}"`, { stdio: "inherit" });
    fs.mkdirSync(h2Contents);
    execSync(`unzip -oq "${h2Jar}" -d "${h2Contents}"`, { stdio: "inherit" });
    fs.rmSync(path.join(h2Contents, "META-INF"), {
      recursive: true,
      force: true,
    });
    execSync(`cd "${h2Contents}" && zip -rgq "${jarPath}" .`, {
      stdio: "inherit",
    });

    const svcFile = path.join(svcRoot, svcRelPath);
    fs.mkdirSync(path.dirname(svcFile), { recursive: true });
    const existing = execSync(`unzip -p "${jarPath}" ${svcRelPath}`).toString();
    fs.writeFileSync(svcFile, `${existing}\norg.h2.Driver\n`);
    execSync(`cd "${svcRoot}" && zip -gq "${jarPath}" ${svcRelPath}`, {
      stdio: "inherit",
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function copyLocalEmbeddingSdkPackage(rootPath: string) {
  const destinationPath = path.join(rootPath, LOCAL_DIST_PATH, "embedding-sdk");

  fs.cpSync(EMBEDDING_SDK_DIST_PATH, destinationPath, { recursive: true });
}
