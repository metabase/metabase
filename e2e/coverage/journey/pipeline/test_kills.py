"""Tests for kills.py.

The verdict tests need the reach index of run 36089233978 and its rerun, and skip without it.
Their test ids and locations come from the stranded culls' reach counts.

  JOURNEY_LOOKUP_INDEX=<index dir> python3 e2e/coverage/journey/pipeline/test_kills.py
"""

import json
import os
import subprocess
import sys
import tempfile
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kills  # noqa: E402

INDEX = os.environ.get("JOURNEY_LOOKUP_INDEX")
MIN_MUTANTS = 2
STRATA = ["logic", "wiring"]

UNIQUE = ("e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js::Action Parameters Mapping Inline action edit "
          "refetches form values when id changes (metabase#33084)")
TWIN_MYSQL = ("e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js::Write Actions on Dashboards (mysql) "
              "adding and executing actions hide actions in public dashboards (metabase#34395)")
TWIN_POSTGRES = ("e2e/test/scenarios/actions/actions-on-dashboards.cy.spec.js::Write Actions on Dashboards (postgres) "
                 "adding and executing actions hide actions in public dashboards (metabase#34395)")
UNREACHED = ("e2e/test/scenarios/admin-2/people.cy.spec.js::scenarios > admin > people user management should immediately "
             "reflect admin privileges when creating user with admin group (metabase#60241)")
FAILED = ("e2e/test/scenarios/question/notebook-data-source.cy.spec.ts::issue 32252 refreshes data picker sources "
          "after archiving a question (metabase#32252)")
UNIT = ("e2e/test/scenarios/collections/uploads.cy.spec.js::CSV Uploading should allow you to choose a model "
        "to append to if there are multiple (metabase#53824)")
ERRORED = ("e2e/test/scenarios/custom-column/custom-column-reproductions-2.cy.spec.js::issue 63180 should not be possible "
           "to close the custom expression editor when creating a new expression from a combine or extract shortcut (metabase#63180)")
MISSING = ("e2e/test/scenarios/custom-column/custom-column-reproductions-1.cy.spec.js::issue 32032 "
           "should allow quick filter drills on custom columns")
PAIRED = ("e2e/test/scenarios/collections/trash.cy.spec.js::scenarios > collections > trash "
          "should not deselect items when aborting operations (metabase#44911)")
BARE = ("e2e/test/scenarios/dashboard-cards/dashboard-sections.cy.spec.js::scenarios > dashboard cards > sections > "
        "read only collections Should allow you to select entities in collections you have read access to (metabase#50602)")
ABSENT = ("e2e/test/scenarios/dashboard-cards/dashcard-replace-question.cy.spec.js::scenarios > dashboard cards > "
          "replace question should replace a dashboard card question (metabase#36984)")
BACKEND = ("e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-text-category.cy.spec.js::issue 68998 "
           "should show all available category options for combined dataset (metabase#68998)")
FILE_ONLY = ("e2e/test/scenarios/filters-reproductions/dashboard-filters-with-question-revert.cy.spec.js::issue 35954 "
             "dashboard filter that loses connection should not crash the UI (metabase#35954) should work for public dashboards")

REMAINING = ("e2e/test/scenarios/dashboard-cards/dashboard-card-resizing.cy.spec.js::scenarios > dashboard card resizing "
             "should display all visualization cards with their default sizes")
JEST = ("frontend/src/metabase/redux/undo.unit.spec.ts::metabase/redux/undo addUndo "
        "should call clearTimeout if adding two undos with the same id")
DEFTEST = "metabase.lib.drill-thru.underlying-records-test/chart-other-slice-click-test"


def fn_location(file, fn, line, column):
    return {"file": file, "fn": fn, "line": line, "column": column}


L_UNIQUE = fn_location("frontend/src/metabase/actions/hooks/use-action-initial-values.ts",
                       "useActionInitialValues > useEffect callback@31", 31, 12)
L_TWIN = fn_location("frontend/src/metabase/public/containers/PublicOrEmbeddedDashboard/PublicOrEmbeddedDashboardPage/"
                     "PublicOrEmbeddedDashboardPage.tsx", "PublicOrEmbeddedDashboardPage > isDashcardVisible callback", 89, 29)
L_SHARED = fn_location("frontend/src/metabase/dashboard/context/context.tsx",
                       "DashboardContextProviderInner > dashboardWithFilteredCards useMemo callback", 377, 47)
L_UNIT = fn_location("frontend/src/metabase/collections/components/ModelUploadModal.tsx", "ModelUploadModal", 21, 16)
L_ERRORED = fn_location("frontend/src/metabase/querying/components/expressions/Editor/Editor.tsx",
                        "useExpression > useMount callback@355", 355, 11)
L_MISSING = {"ns": "metabase.lib.drill-thru.quick-filter", "var": "operators-for",
             "file": "src/metabase/lib/drill_thru/quick_filter.cljc", "line": 73}
L_PAIRED = fn_location("frontend/src/metabase/collections/components/CollectionBulkActions/ArchivedBulkActions.tsx",
                       "handleCloseModal", 48, 27)
L_TARGET_FIELD = fn_location("frontend/src/metabase-lib/v1/parameters/utils/targets.ts", "getParameterTargetField", 63, 16)


def mutant(stratum, killed_by, ran, location=None, errored=(), file=None):
    entry = {"killed_by": killed_by, "errored": list(errored), "ran": ran, "stratum": stratum, "origin": "synthetic"}
    if location:
        # kills.py over a pipeline run reads `file`, and over the index reads `locations`.
        entry |= {"file": location["file"], "locations": [location]}
    if file:
        entry["file"] = file
    return entry


KILLS = {
    "unique": mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE),
    "twin": mutant("wiring", [TWIN_MYSQL, TWIN_POSTGRES], [TWIN_MYSQL, TWIN_POSTGRES, REMAINING], L_TWIN),
    "shared": mutant("logic", [REMAINING], [TWIN_MYSQL, TWIN_POSTGRES, REMAINING, UNREACHED, FAILED], L_SHARED),
    "unit-only": mutant("logic", [JEST], [JEST, UNIT], L_UNIT),
    "unit-shared": mutant("wiring", [UNIT, DEFTEST], [UNIT, DEFTEST], L_UNIT),
    "errored": mutant("logic", [], [ERRORED, REMAINING], L_ERRORED, errored=[ERRORED]),
    "missing": mutant("logic", [MISSING, REMAINING], [MISSING, REMAINING], L_MISSING),
    "missing-pair": mutant("wiring", [MISSING, PAIRED], [MISSING, PAIRED], L_PAIRED),
    "bare": [BARE, REMAINING],
    "no-location": mutant("logic", [REMAINING], [UNREACHED, REMAINING]),
    "backend": mutant("logic", [REMAINING], [BACKEND, REMAINING], file="src/metabase/parameters/params.clj"),
}
CANDIDATES = [UNIQUE, TWIN_MYSQL, TWIN_POSTGRES, UNREACHED, FAILED, UNIT, ERRORED, MISSING, PAIRED, BARE, ABSENT, BACKEND]

COVER_KEEPS = "the kills-first cover keeps it for kills it shares only with other candidates"
EXPECTED = {
    UNIQUE: ("keep", "unique kills"),
    UNREACHED: ("unmeasured", "1 qualifying mutants, fewer than 2"),
    FAILED: ("unmeasured", "failed in the capture run, so its reached code is incomplete"),
    UNIT: ("delete", "no unique kill"),
    ERRORED: ("unmeasured", "0 qualifying mutants, fewer than 2"),
    MISSING: ("unmeasured", "not in the capture run, so its reached code is unknown"),
    PAIRED: ("keep", COVER_KEEPS),
    BARE: ("unmeasured", "ran unknown"),
    ABSENT: ("unmeasured", "not in the kill matrix"),
    BACKEND: ("unmeasured", "1 qualifying mutants, fewer than 2"),
}
COMPARED = ("verdict", "reason", "unique_kills", "kills", "misses", "errored", "qualifying_mutants", "qualifying_without_location")


def write_json(data):
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
    json.dump(data, f)
    f.close()
    return f.name


def pipeline_class_ns(name):
    base = name.split("$")[0]
    if base.endswith("__init"):
        base = base[: -len("__init")]
    parts = base.split("/")
    if len(parts) > 1 and (parts[-1][:1].isupper() or parts[-1] == "proxy"):
        parts.pop()
    return ".".join(parts).replace("_", "-")


class Codes(list):
    def tolist(self):
        return list(self)


def stub_run(candidate_ids, in_index, keys):
    """A pipeline run whose tests are the candidates, with the functions and classes the index says each one reached."""
    file_ids, fn_file_id, class_ns, tests = {}, [], [], []
    for i, cid in enumerate(candidate_ids):
        fns, classes = Codes(), Codes()
        for key_id in in_index.get(cid, {}).get("keys", []):
            key = keys[key_id]
            if key.startswith("fe:"):
                fn_file_id.append(file_ids.setdefault(key[3:key.rindex("#")], len(file_ids)))
                fns.append(len(fn_file_id) - 1)
            else:
                class_ns.append(pipeline_class_ns(key[3:]))
                classes.append(len(class_ns) - 1)
        state = in_index[cid]["state"] if cid in in_index else None
        tests.append(types.SimpleNamespace(id=i, key=cid, base_key=cid, state=state, fns=fns, classes=classes))
    return types.SimpleNamespace(tests=tests, files=list(file_ids), fn_file_id=fn_file_id, class_ns=class_ns)


def pipeline_verdicts(path, candidate_ids):
    """The verdicts kills.py gives over a pipeline run, with the cover's code tie-break taken from the index."""
    in_index = kills.index_reach(INDEX, candidate_ids, {})["tests"]
    with open(os.path.join(INDEX, "keys.json")) as f:
        keys = json.load(f)["keys"]
    run = stub_run(candidate_ids, in_index, keys)
    matrix = kills.load(path, run)
    secondary = [set(in_index[c]["keys"]) if c in in_index else set() for c in candidate_ids]
    kept, _ = kills.cover_kills(run.tests, matrix["mutants"], secondary, [1] * len(candidate_ids))
    return kills.verdicts(run, matrix, set(kept), MIN_MUTANTS, STRATA)


class Helpers(unittest.TestCase):
    def test_clj_namespace(self):
        self.assertEqual(kills.clj_namespace("src/metabase/parameters/params.clj"), "metabase.parameters.params")
        self.assertEqual(kills.clj_namespace("enterprise/backend/src/metabase_enterprise/foo_bar.cljc"), "metabase-enterprise.foo-bar")

    def test_mutant_locations(self):
        own = {"file": "a.ts", "line": 3, "stratum": "logic"}
        self.assertEqual(kills.mutant_locations(own), [{"file": "a.ts", "line": 3}])
        self.assertEqual(kills.mutant_locations(own | {"location": "b.ts#f"}), ["b.ts#f"])
        self.assertEqual(kills.mutant_locations(own | {"locations": ["c.ts:1", "d.ts:2"], "location": "b.ts#f"}), ["c.ts:1", "d.ts:2"])
        self.assertEqual(kills.mutant_locations({"line": 3, "killed_by": []}), [])
        self.assertEqual(kills.mutant_locations([UNIQUE]), [])

    def test_read_candidates(self):
        with tempfile.TemporaryDirectory() as d:
            jsonl = os.path.join(d, "reach-counts.jsonl")
            with open(jsonl, "w") as f:
                f.write("\n".join(json.dumps({"issue": 1, "deleted_test": t}) for t in (UNIQUE, BARE, UNIQUE)) + "\n")
            plain = os.path.join(d, "ids.txt")
            with open(plain, "w") as f:
                f.write(f"{ABSENT}\n\n{BARE}\n")
            self.assertEqual(kills.read_candidates([jsonl, plain, MISSING]), [UNIQUE, BARE, ABSENT, MISSING])


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class Verdicts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kills_file = write_json(KILLS)
        cls.result = kills.evaluate(INDEX, cls.kills_file, CANDIDATES, MIN_MUTANTS, STRATA)
        cls.rows = cls.result["candidates"]

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.kills_file)

    def test_verdicts(self):
        for cid, (verdict, reason) in EXPECTED.items():
            with self.subTest(cid):
                self.assertEqual((self.rows[cid]["verdict"], self.rows[cid]["reason"]), (verdict, reason))

    def test_one_twin_is_kept_for_the_kill_only_the_twins_share(self):
        twins = sorted((self.rows[t]["verdict"], self.rows[t]["reason"]) for t in (TWIN_MYSQL, TWIN_POSTGRES))
        self.assertEqual(twins, [("delete", "no unique kill"), ("keep", COVER_KEEPS)])
        deleted = next(t for t in (TWIN_MYSQL, TWIN_POSTGRES) if self.rows[t]["verdict"] == "delete")
        self.assertEqual(self.rows[deleted]["qualifying_mutants"], {"wiring": 1, "logic": 1})

    def test_details(self):
        self.assertEqual(self.rows[UNIQUE]["unique_kills"], {"logic": ["unique"]})
        self.assertEqual(self.rows[ERRORED]["errored"], ["errored"])
        self.assertEqual(self.rows[UNIT]["qualifying_mutants"], {"logic": 1, "wiring": 1})
        self.assertEqual(self.rows[UNIT]["misses"], 1)
        self.assertEqual(self.rows[UNREACHED]["qualifying_without_location"], {"logic": 1})
        self.assertEqual(self.rows[BACKEND]["qualifying_mutants"], {"logic": 1})

    def test_only_candidates_get_verdicts(self):
        self.assertEqual(set(self.rows), set(CANDIDATES))
        self.assertEqual(self.result["candidates_not_in_index"], [MISSING])
        self.assertEqual(self.result["kills"]["e2e_ids_not_in_index"], [])

    def test_mutants_without_a_location_are_marked(self):
        reach = {mid: m["reach"] for mid, m in self.result["mutants"].items()}
        self.assertEqual({mid for mid, how in reach.items() if how.startswith("no location")}, {"bare", "no-location"})
        self.assertEqual({mid for mid, how in reach.items() if how == "a location"}, set(KILLS) - {"bare", "no-location"})

    def test_pipeline_gives_the_same_verdicts(self):
        pipeline = pipeline_verdicts(self.kills_file, CANDIDATES)
        for cid in CANDIDATES:
            with self.subTest(cid):
                self.assertEqual({f: pipeline[cid].get(f) for f in COMPARED}, {f: self.rows[cid].get(f) for f in COMPARED})

    def test_command(self):
        with tempfile.TemporaryDirectory() as d:
            candidates = os.path.join(d, "candidates.txt")
            with open(candidates, "w") as f:
                f.write("\n".join(CANDIDATES) + "\n")
            out = os.path.join(d, "verdicts.json")
            done = subprocess.run(
                [sys.executable, kills.__file__, "--index", INDEX, "--kills", self.kills_file, "--candidates", candidates,
                 "--min-mutants", str(MIN_MUTANTS), "--require-strata", ",".join(STRATA), "--out", out],
                stdout=subprocess.PIPE, text=True, check=True,
            )
            with open(out) as f:
                written = json.load(f)
        self.assertEqual(written["candidates"], self.rows)
        self.assertIn(f"  {UNIQUE}\n      unique kills: logic 1\n", done.stdout)


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class ReachIsPerFunction(unittest.TestCase):
    def test_a_candidate_that_loads_the_file_but_never_runs_the_function_does_not_reach_it(self):
        kills_file = write_json({
            "a": mutant("logic", [REMAINING], [FILE_ONLY, REMAINING], L_TARGET_FIELD),
            "b": mutant("wiring", [REMAINING], [FILE_ONLY, REMAINING], file=L_TARGET_FIELD["file"]),
        })
        try:
            by_index = kills.evaluate(INDEX, kills_file, [FILE_ONLY], 1, [])["candidates"][FILE_ONLY]
            by_file = pipeline_verdicts(kills_file, [FILE_ONLY])[FILE_ONLY]
        finally:
            os.unlink(kills_file)
        self.assertEqual(by_index["qualifying_mutants"], {"wiring": 1})
        self.assertEqual(by_file["qualifying_mutants"], {"logic": 1, "wiring": 1})


if __name__ == "__main__":
    unittest.main()
