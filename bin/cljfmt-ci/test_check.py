import os
from pathlib import Path
import subprocess
import tempfile
import unittest


CHECK = Path(__file__).resolve().with_name("check")


class FormattingCheck(unittest.TestCase):
    def test_full_and_changed_checks(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

            def put(path, contents):
                file = root / path
                file.parent.mkdir(exist_ok=True, parents=True)
                file.write_text(contents)

            def snapshot():
                git("add", "-A")
                git("-c", "user.email=ci@example.com", "-c", "user.name=CI",
                    "-c", "commit.gpgsign=false", "commit", "-qm", "Fixture")
                return git("rev-parse", "HEAD")

            def check(status, *args):
                run = subprocess.run(["bash", CHECK, *args], cwd=root,
                                     capture_output=True, text=True, env=os.environ)
                output = run.stdout + run.stderr
                self.assertEqual(run.returncode, status, output)
                return output

            git("init", "-q")
            put(".cljfmt.edn", '{:paths ["src" ".clj-kondo/test"]}\n')
            put("src/unchanged.clj", "( def x 1 )\n")
            put("src/deleted.clj", "(def x 1)\n")
            put("outside/moved.clj", "( def x 1 )\n")
            base = snapshot()

            put("outside/new.clj", "( def x 1 )\n")
            (root / "src/deleted.clj").unlink()
            clean = snapshot()
            self.assertIn("No changed files", check(0, "--pr", clean))
            self.assertIn("No changed files", check(0, "--pr", base))
            self.assertIn("src/unchanged.clj", check(1))
            self.assertIn("src/unchanged.clj", check(1, "--pr", "missing-base"))

            (root / "outside/moved.clj").rename(root / "src/with space.clj")
            moved = snapshot()
            self.assertIn("src/with space.clj", check(1, "--pr", clean))
            self.assertIn("src/unchanged.clj", check(1, "--pr"))
            put("src/with space.clj", "(def x 1)\n")
            put(".clj-kondo/test/new.bb", "(def x\n")
            other = snapshot()
            self.assertIn(".clj-kondo/test/new.bb", check(2, "--pr", moved))
            git("checkout", "-qb", "base-branch", clean)
            put("src/on-base.clj", "( def x 1 )\n")
            snapshot()
            git("-c", "user.email=ci@example.com", "-c", "user.name=CI",
                "-c", "commit.gpgsign=false", "merge", "--no-ff", "-qm", "PR merge", moved)
            pr_output = check(1, "--pr")
            self.assertIn("src/with space.clj", pr_output)
            self.assertNotIn("src/on-base.clj", pr_output)
            self.assertIn("src/on-base.clj", check(1, "--pr", clean))
            git("checkout", "-q", other)

            (root / ".clj-kondo/test/new.bb").unlink()
            put(".cljfmt.edn", '{:paths ["src"]}\n')
            snapshot()
            configured = git("rev-parse", "HEAD")
            self.assertIn("src/unchanged.clj", check(1, "--pr", other))

            put("src/.gitattributes", "*.clj text\n")
            snapshot()
            self.assertIn("src/unchanged.clj", check(1, "--pr", configured))

            put("outside/linked.clj", "(def x 1)\n")
            (root / "src/link").symlink_to("../outside", target_is_directory=True)
            linked = snapshot()
            put("outside/linked.clj", "( def x 1 )\n")
            snapshot()
            self.assertIn("src/link/linked.clj", check(1, "--pr", linked))


if __name__ == "__main__":
    unittest.main()
