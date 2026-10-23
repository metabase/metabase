import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parent


class ExternalRepoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "metabase"
        self.remote = self.root / "remote"
        (self.project / "locales").mkdir(parents=True)
        shutil.copytree(SCRIPTS, self.project / "bin/i18n")
        self.env = dict(os.environ, METABASE_I18N_REPOSITORY=str(self.remote),
                        GIT_AUTHOR_NAME="Test", GIT_AUTHOR_EMAIL="test@example.com",
                        GIT_COMMITTER_NAME="Test", GIT_COMMITTER_EMAIL="test@example.com")
        self.git("init", "--quiet", str(self.remote))
        (self.remote / "locales").mkdir()
        for name in ["metabase", "en-ZZ", "fr"]:
            (self.remote / "locales" / f"{name}.po").write_text("original\n")
        self.first = self.commit("first")
        self.pin = self.project / "locales/metabase-i18n.commit"
        self.pin.write_text(self.first + "\n")
        (self.remote / "locales/fr.po").write_text("newer\n")
        self.second = self.commit("second")

    def git(self, *args, cwd=None):
        return subprocess.check_output(["git", *args], cwd=cwd, env=self.env, text=True).strip()

    def commit(self, message):
        self.git("add", ".", cwd=self.remote)
        self.git("commit", "--quiet", "-m", message, cwd=self.remote)
        return self.git("rev-parse", "HEAD", cwd=self.remote)

    def run_script(self, name, *args, check=True):
        return subprocess.run([str(self.project / "bin/i18n" / name), *args],
                              cwd=self.project, env=self.env, text=True,
                              capture_output=True, check=check)

    def test_exact_pin_and_offline_reuse(self):
        catalog = Path(self.run_script("fetch-translations").stdout.strip())
        self.assertEqual(catalog, self.project / "locales/metabase-i18n" / self.first)
        self.assertEqual((catalog / "fr.po").read_text(), "original\n")
        self.assertFalse(list((self.project / "locales").glob("*.po")))
        self.env["METABASE_I18N_REPOSITORY"] = str(self.root / "unavailable")
        self.assertEqual(self.run_script("fetch-translations").stdout.strip(), str(catalog))

    def test_pin_changes_preserve_both_snapshots(self):
        first = Path(self.run_script("fetch-translations").stdout.strip())
        self.pin.write_text(self.second + "\n")
        second = Path(self.run_script("fetch-translations").stdout.strip())
        self.assertEqual((first / "fr.po").read_text(), "original\n")
        self.assertEqual((second / "fr.po").read_text(), "newer\n")

    def test_invalid_and_missing_commits_fail_without_cache(self):
        for pin in ["../escape", "0" * 40]:
            self.pin.write_text(pin + "\n")
            result = self.run_script("fetch-translations", check=False)
            self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.project / "locales/metabase-i18n" / ("0" * 40)).exists())

    def test_concurrent_fetches(self):
        command = [str(self.project / "bin/i18n/fetch-translations")]
        processes = [subprocess.Popen(command, cwd=self.project, env=self.env,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                     for _ in range(2)]
        outputs = []
        for process in processes:
            out, err = process.communicate(timeout=30)
            self.assertEqual(process.returncode, 0, err)
            outputs.append(out)
        self.assertEqual(outputs[0], outputs[1])

    def test_publish_then_advance_pin(self):
        snapshot = Path(self.run_script("fetch-translations").stdout.strip())
        checkout = Path(self.run_script("prepare-translation-update").stdout.strip())
        (checkout / "locales/fr.po").write_text("updated\n")
        (checkout / "locales/temporary.pot").write_text("temporary\n")
        self.run_script("publish-translations", str(checkout))
        published = self.pin.read_text().strip()
        self.assertNotEqual(published, self.first)
        self.assertEqual(self.git("show", f"{published}:locales/fr.po", cwd=self.remote), "updated")
        self.assertEqual(self.git("rev-parse", f"refs/heads/metabase-{published}", cwd=self.remote), published)
        self.assertEqual((snapshot / "fr.po").read_text(), "original\n")
        files = self.git("ls-tree", "-r", "--name-only", published, cwd=self.remote)
        self.assertNotIn("temporary.pot", files)

    def test_failed_push_does_not_advance_pin(self):
        checkout = Path(self.run_script("prepare-translation-update").stdout.strip())
        (checkout / "locales/fr.po").write_text("updated\n")
        self.git("remote", "set-url", "--push", "origin", str(self.root / "unavailable"), cwd=checkout)
        self.assertNotEqual(self.run_script("publish-translations", str(checkout), check=False).returncode, 0)
        self.assertEqual(self.pin.read_text().strip(), self.first)
        self.git("remote", "set-url", "--push", "origin", str(self.remote), cwd=checkout)
        self.run_script("publish-translations", str(checkout))
        self.assertNotEqual(self.pin.read_text().strip(), self.first)

    def test_no_changes_do_not_push(self):
        checkout = Path(self.run_script("prepare-translation-update").stdout.strip())
        self.git("remote", "set-url", "--push", "origin", str(self.root / "unavailable"), cwd=checkout)
        self.run_script("publish-translations", str(checkout))
        self.assertEqual(self.pin.read_text().strip(), self.first)

    def test_incomplete_cache_is_not_used(self):
        directory = self.project / "locales/metabase-i18n" / self.first
        directory.mkdir(parents=True)
        (directory / "fr.po").write_text("incomplete")
        self.assertNotEqual(self.run_script("fetch-translations", check=False).returncode, 0)

    def test_missing_cached_locale_is_rejected(self):
        catalog = Path(self.run_script("fetch-translations").stdout.strip())
        (catalog / "fr.po").unlink()
        self.assertNotEqual(self.run_script("fetch-translations", check=False).returncode, 0)

    def test_resources_rebuild_when_pin_or_outputs_change(self):
        key_script = self.project / "bin/i18n/translation-resource-key"
        key_script.write_text('#!/usr/bin/env bash\ncat locales/metabase-i18n.commit\n')
        builder = self.project / "bin/i18n/build-translation-resources"
        builder.write_text('''#!/usr/bin/env bash
set -euo pipefail
mkdir -p target resources/i18n resources/frontend_client/app/locales
echo build >> target/builds
source_directory=$(./bin/i18n/fetch-translations)
for po in "$source_directory/"*.po; do
  locale=$(basename "$po" .po)
  [[ "$locale" != metabase* ]] || continue
  cp "$po" "resources/i18n/$locale.edn"
  cp "$po" "resources/frontend_client/app/locales/${locale//-/_}.json"
  chmod u+w "resources/i18n/$locale.edn" "resources/frontend_client/app/locales/${locale//-/_}.json"
done
cp locales/metabase-i18n.commit target/i18n-resources.key
''')
        self.run_script("ensure-translation-resources")
        self.run_script("ensure-translation-resources")
        builds = self.project / "target/builds"
        self.assertEqual(builds.read_text().splitlines(), ["build"])
        self.pin.write_text(self.second + "\n")
        self.run_script("ensure-translation-resources")
        self.assertEqual(builds.read_text().splitlines(), ["build", "build"])
        (self.project / "resources/i18n/en-ZZ.edn").unlink()
        self.run_script("ensure-translation-resources")
        self.assertEqual(builds.read_text().splitlines(), ["build", "build", "build"])

    def test_stale_update_is_rejected(self):
        checkout = Path(self.run_script("prepare-translation-update").stdout.strip())
        (checkout / "locales/fr.po").write_text("updated\n")
        self.pin.write_text(self.second + "\n")
        self.assertNotEqual(self.run_script("publish-translations", str(checkout), check=False).returncode, 0)
        self.assertEqual(self.pin.read_text().strip(), self.second)


if __name__ == "__main__":
    unittest.main()
