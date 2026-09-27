"""Tests for kills.py.

The verdict tests need the reach index of run 36089233978 and its rerun, and skip without it.
Their test ids and locations come from the stranded culls' reach counts.
The real-data test also needs the corpus kills file, the reach counts and the location prior,
from the `local/` folder of this checkout or JOURNEY_LOCAL_DIR, and skips without them.

  JOURNEY_LOOKUP_INDEX=<index dir> [JOURNEY_LOCAL_DIR=<local dir>] python3 e2e/coverage/journey/pipeline/test_kills.py
"""

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kills  # noqa: E402

INDEX = os.environ.get("JOURNEY_LOOKUP_INDEX")
LOCAL = os.environ.get("JOURNEY_LOCAL_DIR") or os.path.join(HERE, "..", "..", "..", "..", "local")
REAL_KILLS = os.path.join(LOCAL, "regression-corpus", "overnight", "kills.json")
REAL_CANDIDATES = os.path.join(LOCAL, "regression-corpus", "reach-counts.jsonl")
REAL_PRIOR = os.path.join(LOCAL, "test-coverage-verifier", "data", "location-prior.json")
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
REPRO_69160 = ("e2e/test/scenarios/native/native-reproductions.cy.spec.ts::issue 69160 should be possible to reorder parameters "
               "when there are snippets in the query (metabase#69160)")
REPRO_35009 = ("e2e/test/scenarios/search/search.cy.spec.js::scenarios > search universal search should not dismiss "
               "when a dashboard finishes loading (metabase#35009)")
BOOKMARKS = ("e2e/test/scenarios/organization/bookmarks-collection.cy.spec.js::scenarios > organization > bookmarks > collection "
             "should update bookmarks list when restoring a collection containing bookmarked items (metabase#44499)")

REMAINING = ("e2e/test/scenarios/dashboard-cards/dashboard-card-resizing.cy.spec.js::scenarios > dashboard card resizing "
             "should display all visualization cards with their default sizes")
JEST = ("frontend/src/metabase/redux/undo.unit.spec.ts::metabase/redux/undo addUndo "
        "should call clearTimeout if adding two undos with the same id")
DEFTEST = "metabase.lib.drill-thru.underlying-records-test/chart-other-slice-click-test"
SEARCH_BAR_JEST = ("frontend/src/metabase/nav/components/search/SearchBar/SearchBar.unit.spec.tsx::SearchBar dismissing search "
                   "on navigation should not dismiss the search results when the location is replaced (metabase#35009)")
BOOKMARK_COLLECTION = ("e2e/test/scenarios/organization/bookmarks-collection.cy.spec.js::scenarios > organization > bookmarks > "
                       "collection collection items can bookmark a collection")
BOOKMARK_MODEL = ("e2e/test/scenarios/organization/bookmarks-collection.cy.spec.js::scenarios > organization > bookmarks > "
                  "collection collection items adds and removes bookmarks from Model in collection")


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
L_69160 = fn_location("frontend/src/metabase-lib/v1/queries/NativeQuery.ts", "setParameterIndex", 233, 2)
L_35009 = fn_location("frontend/src/metabase/nav/components/search/SearchBar/SearchBar.tsx",
                      "SearchBar > useEffect callback@147", 147, 12)


def mutant(stratum, killed_by, ran, location=None, errored=(), file=None, unconfirmed_by=()):
    entry = {"killed_by": killed_by, "errored": list(errored), "ran": ran, "stratum": stratum, "origin": "synthetic"}
    if unconfirmed_by:
        entry["unconfirmed_by"] = list(unconfirmed_by)
    if location:
        # kills.py over a pipeline run reads `file`, and over the index reads `locations`.
        entry |= {"file": location["file"], "locations": [location]}
    if file:
        entry["file"] = file
    return entry


def boot_mutant(ran, **tags):
    """A baseline mutant with no location that a remaining test kills, tagged as the corpus tags one unless `tags` says otherwise."""
    return mutant("server-state", [REMAINING], ran + [REMAINING]) | ({"stratum_coarse": "baseline"} if not tags else tags)


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
COVER_KEEPS_UNCONFIRMED = "the kills-first cover keeps it for unconfirmed kills it shares only with other candidates"
NEEDS_BASELINE = "needs a baseline check"
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
COMPARED = ("verdict", "reason", "unique_kills", "unconfirmed_unique_kills", "cover_kept_for", "kills", "misses", "errored",
            "qualifying_mutants", "qualifying_without_location", "depends_on")
SHARED_KILLS_HEADING = "\nKills that no remaining test has\n"

UNCONFIRMED_KILLS = {
    "reg-69160": mutant("logic", [], [REPRO_69160, REMAINING, JEST], L_69160, unconfirmed_by=[REPRO_69160]),
    "reg-35009": mutant("logic", [SEARCH_BAR_JEST], [REPRO_35009, SEARCH_BAR_JEST], L_35009, unconfirmed_by=[REPRO_35009]),
    "unconfirmed-twice": mutant("state", [], [BOOKMARKS, BOOKMARK_COLLECTION], unconfirmed_by=[BOOKMARKS, BOOKMARK_COLLECTION]),
    "unique": mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE),
    "unique-unconfirmed": mutant("wiring", [], [UNIQUE, REMAINING], L_UNIQUE, unconfirmed_by=[UNIQUE]),
    "twin": mutant("wiring", [TWIN_MYSQL, TWIN_POSTGRES], [TWIN_MYSQL, TWIN_POSTGRES, REMAINING], L_TWIN),
    "postgres-unconfirmed": mutant("logic", [], [TWIN_MYSQL, TWIN_POSTGRES, REMAINING], L_TWIN, unconfirmed_by=[TWIN_POSTGRES]),
}
UNCONFIRMED_CANDIDATES = [REPRO_69160, REPRO_35009, BOOKMARKS, UNIQUE, TWIN_MYSQL, TWIN_POSTGRES]
UNCONFIRMED_EXPECTED = {
    REPRO_69160: ("provisional-keep", "unconfirmed unique kills"),
    REPRO_35009: ("unmeasured", NEEDS_BASELINE),
    BOOKMARKS: ("unmeasured", NEEDS_BASELINE),
    UNIQUE: ("keep", "unique kills"),
    TWIN_POSTGRES: ("keep", COVER_KEEPS),
    TWIN_MYSQL: ("delete", "no unique kill"),
}


L_FAILED = {"file": "frontend/src/metabase/querying/notebook/components/NotebookDataPicker/NotebookDataPicker.tsx"}
L_PARAMS = {"file": "src/metabase/parameters/params.clj"}
L_TARGETS = {"file": L_TARGET_FIELD["file"]}


def shared(name, count, stratum, candidates, location):
    """`count` mutants at the location that the candidates and a remaining test all run and kill."""
    return {f"{name}-{i}": mutant(stratum, candidates + [REMAINING], candidates + [REMAINING], location) for i in range(1, count + 1)}


ACCEPT_KILLS = {
    **shared("unique", 5, "logic", [UNIQUE], L_UNIQUE),
    **shared("twin", 4, "wiring", [TWIN_MYSQL, TWIN_POSTGRES], L_TWIN),
    **shared("failed", 4, "logic", [FAILED], L_FAILED),
    **shared("35009", 4, "logic", [REPRO_35009], L_35009),
    "35009-unique": mutant("logic", [REPRO_35009], [REPRO_35009, REMAINING], L_35009),
    **shared("69160", 4, "logic", [REPRO_69160], L_69160),
    "69160-unconfirmed": mutant("logic", [], [REPRO_69160, REMAINING], L_69160, unconfirmed_by=[REPRO_69160]),
    **shared("paired", 3, "wiring", [PAIRED], L_PAIRED),
    **shared("params", 4, "logic", [BACKEND], L_PARAMS),
    **shared("targets", 4, "logic", [FILE_ONLY], L_TARGETS),
    **{f"unit-{i}": mutant("logic", [JEST], [UNIT, JEST], L_UNIT) for i in range(1, 5)},
}
ACCEPT_CANDIDATES = [UNIQUE, TWIN_MYSQL, TWIN_POSTGRES, FAILED, REPRO_35009, REPRO_69160, PAIRED, BACKEND, FILE_ONLY, UNIT, ABSENT]
ACCEPT_MIN_MUTANTS = 10


def prior_entry(module, score):
    entry = {"relative_churn": 0.05, "fix_commits": 1, "corpus_regressions": 0}
    if module:
        entry["module"] = module
    if score is not None:
        entry["score"] = score
    return entry


PRIOR = {
    "meta": {"base_commit": "8317274709c"},
    "files": {
        L_UNIQUE["file"]: prior_entry("fe:quiet", 0.1),
        L_TWIN["file"]: prior_entry("fe:quiet", 0.2),
        L_FAILED["file"]: prior_entry("fe:notebook", 0.1),
        L_35009["file"]: prior_entry("fe:search", 0.1),
        L_69160["file"]: prior_entry("fe:native", 0.1),
        L_PAIRED["file"]: prior_entry("fe:collections", 0.1),
        L_PARAMS["file"]: prior_entry("be:parameters", None),
        L_TARGETS["file"]: prior_entry(None, 0.1),
        L_UNIT["file"]: prior_entry("fe:uploads", 0.1),
    },
    "modules": {"fe:quiet": {"relative_churn": 0.05, "fix_commits": 2, "corpus_regressions": 0, "score": 0.15}},
}
CI_HISTORY = {"tests": {UNIQUE: {"failures": 4, "real": 0, "flakes": 4}, TWIN_POSTGRES: {"failures": 1, "real": 1, "flakes": 0}}}
ACCEPTED_HEADING = "\nAccepted, on a stated risk and not a measured delete\n"


def outcomes(result, candidate_ids):
    """The candidates' verdicts and reasons, sorted because which of them the cover keeps is a tie-break."""
    return sorted((result["candidates"][c]["verdict"], result["candidates"][c]["reason"]) for c in candidate_ids)


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


def pipeline_verdicts(path, candidate_ids, min_mutants=MIN_MUTANTS, strata=STRATA):
    """The verdicts kills.py gives over a pipeline run, with the cover's code tie-break taken from the index."""
    in_index = kills.index_reach(INDEX, candidate_ids, {})["tests"]
    with open(os.path.join(INDEX, "keys.json")) as f:
        keys = json.load(f)["keys"]
    run = stub_run(candidate_ids, in_index, keys)
    matrix = kills.load(path, run)
    secondary = [set(in_index[c]["keys"]) if c in in_index else set() for c in candidate_ids]
    kept, _ = kills.cover_kills(run.tests, matrix["mutants"], secondary, [1] * len(candidate_ids))
    return kills.verdicts(run, matrix, set(kept), min_mutants, strata)


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

    def test_rule_of_three(self):
        self.assertEqual([kills.rule_of_three(n) for n in (None, 0, 3, 4, 30)], [None, None, None, 0.75, 0.1])

    def test_coarse_stratum(self):
        finer = ["logic", "intra-frontend-wiring", "boundary-wiring", "browser-measurement", "store-state", "server-state",
                 "cross-page-timing"]
        self.assertEqual([kills.coarse_stratum({"stratum": s}) for s in finer],
                         ["logic", "wiring", "wiring", "wiring", "state", "state", "state"])
        self.assertEqual(kills.coarse_stratum({"stratum": "server-state", "stratum_coarse": "baseline"}), "baseline")
        self.assertEqual([kills.coarse_stratum({"stratum": s}) for s in ("wiring", "baseline", None)], ["wiring", "baseline", None])

    def test_static_importers_look_through_barrels(self):
        graph = {"barrels": ["index.ts"], "importers": {"a.ts": ["index.ts", "b.ts"], "index.ts": ["c.ts"], "b.ts": ["d.ts"]}}
        self.assertEqual(kills.static_importers(["a.ts"], graph), {"index.ts", "b.ts", "c.ts"})

    def test_importer_summary_lists_the_highest_scored_importers(self):
        importers = [f"i{n:02}.ts" for n in range(12)]
        accept = types.SimpleNamespace(graph={"importers": {"a.ts": importers + ["unscored.ts"]}},
                                       prior={"files": {f: {"score": n / 100} for n, f in enumerate(importers)}})
        summary = kills.importer_summary(["a.ts"], accept)
        self.assertEqual({k: summary[k] for k in ("role", "count", "unscored", "max")},
                         {"role": "information only", "count": 13, "unscored": 1, "max": 0.11})
        self.assertEqual(list(summary["highest"].items()), [(f"i{n:02}.ts", n / 100) for n in range(11, 1, -1)])


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
        kept = next(t for t in (TWIN_MYSQL, TWIN_POSTGRES) if self.rows[t]["verdict"] == "keep")
        self.assertEqual((self.rows[kept]["cover_kept_for"], self.rows[deleted]["cover_kept_for"]), ({"wiring": ["twin"]}, {}))

    def test_the_deleted_twin_depends_on_the_kept_twin(self):
        kept = next(t for t in (TWIN_MYSQL, TWIN_POSTGRES) if self.rows[t]["verdict"] == "keep")
        deleted = next(t for t in (TWIN_MYSQL, TWIN_POSTGRES) if self.rows[t]["verdict"] == "delete")
        self.assertEqual({cid: r["depends_on"] for cid, r in self.rows.items() if r.get("depends_on")}, {
            deleted: {"wiring": {"twin": [kept]}},
            MISSING: {"wiring": {"missing-pair": [PAIRED]}},
        })
        self.assertEqual({cid for cid, r in self.rows.items() if "depends_on" not in r}, {UNIQUE, PAIRED, kept})
        self.assertEqual(self.result["joint_check"], "ok")
        text = kills.report(self.result)
        self.assertTrue(text.startswith("Joint check: ok\n"))
        self.assertIn(f"{SHARED_KILLS_HEADING}  {deleted}\n      delete, safe only while {kept} stay, for wiring twin\n"
                      f"  {MISSING}\n      unmeasured, safe only while {PAIRED} stay, for wiring missing-pair\n", text)

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
class UnconfirmedKills(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kills_file = write_json(UNCONFIRMED_KILLS)
        cls.result = kills.evaluate(INDEX, cls.kills_file, UNCONFIRMED_CANDIDATES, 1, [])
        cls.rows = cls.result["candidates"]

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.kills_file)

    def test_verdicts(self):
        for cid, (verdict, reason) in UNCONFIRMED_EXPECTED.items():
            with self.subTest(cid):
                self.assertEqual((self.rows[cid]["verdict"], self.rows[cid]["reason"]), (verdict, reason))

    def test_an_unconfirmed_kill_is_unique_only_when_no_other_test_killed_the_mutant_confirmed_or_not(self):
        found = {cid: r["unconfirmed_unique_kills"] for cid, r in self.rows.items() if r["unconfirmed_unique_kills"]}
        self.assertEqual(found, {
            REPRO_69160: {"logic": ["reg-69160"]},
            UNIQUE: {"wiring": ["unique-unconfirmed"]},
            TWIN_POSTGRES: {"logic": ["postgres-unconfirmed"]},
        })

    def test_an_unconfirmed_unique_kill_turns_a_delete_or_an_unmeasured_into_a_provisional_keep(self):
        booted = UNCONFIRMED_KILLS | {"boot": boot_mutant([REPRO_69160])}
        confirmed_only = write_json({mid: {k: v for k, v in m.items() if k != "unconfirmed_by"} for mid, m in booted.items()})
        with_unconfirmed = write_json(booted)
        try:
            for min_mutants, strata, otherwise in ((1, [], "delete"), (kills.MIN_MUTANTS, STRATA, "unmeasured")):
                with self.subTest(otherwise):
                    by_file = {f: kills.evaluate(INDEX, f, [REPRO_69160], min_mutants, strata)["candidates"][REPRO_69160]["verdict"]
                               for f in (confirmed_only, with_unconfirmed)}
                    self.assertEqual(by_file, {confirmed_only: otherwise, with_unconfirmed: "provisional-keep"})
        finally:
            os.unlink(confirmed_only)
            os.unlink(with_unconfirmed)

    def test_the_cover_keeps_every_candidate_with_an_unconfirmed_unique_kill(self):
        self.assertEqual(set(self.result["kills_cover"]["kept"]), {REPRO_69160, UNIQUE, TWIN_POSTGRES})

    def test_reports(self):
        summary = self.result["summary"]
        self.assertEqual(summary["verdicts"], {"keep": 2, "provisional-keep": 1, "delete": 1, "unmeasured": 2, "accepted": 0})
        self.assertEqual(summary["reasons"]["provisional-keep: unconfirmed unique kills"], 1)
        self.assertEqual(summary["strata"]["provisional-keep, tests with an unconfirmed unique kill in the stratum"], {"logic": 1})
        text = kills.report(self.result)
        self.assertIn("\nprovisional-keep 1\n", text)
        self.assertIn(f"\nProvisional-keep\n  {REPRO_69160}\n      unconfirmed unique kills: logic 1\n", text)

    def test_pipeline_gives_the_same_verdicts(self):
        pipeline = pipeline_verdicts(self.kills_file, UNCONFIRMED_CANDIDATES, 1, [])
        for cid in UNCONFIRMED_CANDIDATES:
            with self.subTest(cid):
                self.assertEqual({f: pipeline[cid].get(f) for f in COMPARED}, {f: self.rows[cid].get(f) for f in COMPARED})

    def evaluate_alone(self, entries, candidate_ids):
        """The result for a kills file of only these entries, whose verdicts the pipeline must give too."""
        path = write_json(entries)
        try:
            result = kills.evaluate(INDEX, path, candidate_ids, 1, [])
            pipeline = pipeline_verdicts(path, candidate_ids, 1, [])
        finally:
            os.unlink(path)
        for cid in candidate_ids:
            self.assertEqual({f: pipeline[cid].get(f) for f in COMPARED}, {f: result["candidates"][cid].get(f) for f in COMPARED})
        return result

    def test_one_of_two_twins_that_share_only_an_unconfirmed_kill_is_kept(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        result = self.evaluate_alone({"twins": mutant("logic", [], twins + [REMAINING], L_TWIN, unconfirmed_by=twins)}, twins)
        self.assertEqual(outcomes(result, twins), [("provisional-keep", COVER_KEEPS_UNCONFIRMED), ("unmeasured", NEEDS_BASELINE)])
        [kept] = result["kills_cover"]["kept"]
        self.assertEqual({t: result["candidates"][t]["cover_kept_for"] for t in twins},
                         {t: {"logic": ["twins"]} if t == kept else {} for t in twins})
        self.assertIn(f"\nProvisional-keep\n  {kept}\n      {COVER_KEEPS_UNCONFIRMED}\n      kept by the cover for logic twins\n",
                      kills.report(result))

    def test_one_of_three_candidates_that_share_only_an_unconfirmed_kill_is_kept(self):
        three = [BOOKMARKS, BOOKMARK_COLLECTION, BOOKMARK_MODEL]
        result = self.evaluate_alone({"three": mutant("state", [], three + [REMAINING], unconfirmed_by=three)}, three)
        self.assertEqual(outcomes(result, three), [("provisional-keep", COVER_KEEPS_UNCONFIRMED)] + [("unmeasured", NEEDS_BASELINE)] * 2)

    def test_a_twin_with_a_confirmed_kill_is_kept_over_a_twin_with_an_unconfirmed_one(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        result = self.evaluate_alone(
            {"mix": mutant("logic", [TWIN_MYSQL], twins + [REMAINING], L_TWIN, unconfirmed_by=[TWIN_POSTGRES])}, twins)
        self.assertEqual(outcomes(result, [TWIN_MYSQL]), [("keep", "unique kills")])
        self.assertEqual(outcomes(result, [TWIN_POSTGRES]), [("unmeasured", NEEDS_BASELINE)])
        self.assertEqual(result["kills_cover"]["kept"], [TWIN_MYSQL])
        self.assertEqual({t: result["candidates"][t]["cover_kept_for"] for t in twins}, {TWIN_MYSQL: {"logic": ["mix"]}, TWIN_POSTGRES: {}})

    def test_the_cover_keeps_a_confirmed_killer_over_an_unconfirmed_killer_with_more_kills(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        result = self.evaluate_alone({
            "twins-and-bookmarks": mutant("logic", twins, twins + [BOOKMARKS, REMAINING], unconfirmed_by=[BOOKMARKS]),
            "bookmarks": mutant("state", [], [BOOKMARKS, REMAINING], unconfirmed_by=[BOOKMARKS]),
        }, twins + [BOOKMARKS])
        self.assertEqual(outcomes(result, twins), [("delete", "no unique kill"), ("keep", COVER_KEEPS)])
        self.assertEqual(outcomes(result, [BOOKMARKS]), [("provisional-keep", "unconfirmed unique kills")])
        kept = next(t for t in twins if result["candidates"][t]["verdict"] == "keep")
        self.assertEqual({t: result["candidates"][t]["cover_kept_for"] for t in twins + [BOOKMARKS]},
                         {t: {"logic": ["twins-and-bookmarks"]} if t == kept else {} for t in twins} | {BOOKMARKS: {"state": ["bookmarks"]}})


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class Accepted(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kills_file = write_json(ACCEPT_KILLS)
        cls.prior_file = write_json(PRIOR)
        cls.ci_history_file = write_json(CI_HISTORY)
        cls.result = cls.evaluate()
        cls.rows = cls.result["candidates"]

    @classmethod
    def tearDownClass(cls):
        for path in (cls.kills_file, cls.prior_file, cls.ci_history_file):
            os.unlink(path)

    @classmethod
    def evaluate(cls, kills_file=None, candidate_ids=ACCEPT_CANDIDATES, **options):
        options = {"prior_path": cls.prior_file, "ci_history_path": cls.ci_history_file, "cap": 2} | options
        return kills.evaluate(INDEX, kills_file or cls.kills_file, candidate_ids, ACCEPT_MIN_MUTANTS, [], **options)

    @classmethod
    def evaluate_entries(cls, entries, **options):
        path = write_json(entries)
        try:
            return cls.evaluate(path, **options)
        finally:
            os.unlink(path)

    @staticmethod
    def accepted(result):
        return {cid for cid, r in result["candidates"].items() if r["verdict"] == "accepted"}

    def test_the_cap_accepts_the_lowest_priors_first(self):
        self.assertEqual(self.accepted(self.result), {UNIQUE, TWIN_MYSQL})
        self.assertEqual(self.rows[UNIQUE]["acceptance"] | {"ci_history": None}, {
            "prior": {"score": 0.1, "files": {L_UNIQUE["file"]: 0.1}}, "prior_over": "reached files",
            "sampled": 5, "bound": 0.6, "modules": ["fe:quiet"], "missing": {}, "survivors": [], "outcome": "accepted",
            "ci_history": None,
        })
        self.assertEqual((self.rows[TWIN_MYSQL]["acceptance"]["bound"], self.rows[TWIN_MYSQL]["acceptance"]["prior"]["score"]), (0.75, 0.2))
        self.assertEqual((self.rows[TWIN_POSTGRES]["verdict"], self.rows[TWIN_POSTGRES]["acceptance"]["outcome"]),
                         ("unmeasured", "over the module cap"))

    def test_a_candidate_exactly_at_the_cap_is_accepted(self):
        self.assertEqual(self.accepted(self.evaluate(cap=3)), {UNIQUE, TWIN_MYSQL, TWIN_POSTGRES})
        self.assertEqual(self.accepted(self.evaluate(cap=1)), {UNIQUE})

    def test_each_missing_field_keeps_a_candidate_unmeasured(self):
        expected = {
            PAIRED: {"bound": "3/n bounds nothing for n = 3"},
            BACKEND: {"prior": f"no score in the prior for {L_PARAMS['file']}"},
            FILE_ONLY: {"module": f"no module in the prior for {L_TARGETS['file']}"},
            ABSENT: {"prior": "no mutants sampled, so no reached locations", "sampled": "not in the kill matrix",
                     "bound": "no mutants sampled", "module": "no mutants sampled, so no reached locations"},
        }
        for cid, missing in expected.items():
            with self.subTest(cid):
                row = self.rows[cid]
                self.assertEqual((row["verdict"], row["acceptance"]["outcome"], row["acceptance"]["missing"]),
                                 ("unmeasured", "missing fields", missing))
        without_prior = self.evaluate(prior_path=None)
        self.assertEqual(self.accepted(without_prior), set())
        self.assertEqual(without_prior["candidates"][UNIQUE]["acceptance"]["missing"],
                         {"prior": "no location prior given", "module": "no location prior given"})

    def test_accepted_never_overrides_keep_provisional_keep_or_a_failed_capture(self):
        result = self.evaluate(cap=100, max_prior=1)
        rows = result["candidates"]
        self.assertEqual([rows[c]["verdict"] for c in (REPRO_35009, REPRO_69160)], ["keep", "provisional-keep"])
        self.assertNotIn("acceptance", rows[REPRO_35009])
        self.assertNotIn("acceptance", rows[REPRO_69160])
        failed = rows[FAILED]
        self.assertEqual((failed["verdict"], failed["acceptance"]["missing"], failed["acceptance"]["outcome"]),
                         ("unmeasured", {}, "never: did not pass in the capture"))

    def test_accepted_has_its_own_section_in_the_output(self):
        section = self.result["accepted"]
        self.assertEqual(set(section["candidates"]), {UNIQUE, TWIN_MYSQL})
        self.assertEqual(section["modules"]["fe:quiet"],
                         {"accepted": sorted([UNIQUE, TWIN_MYSQL]), "over_cap": [TWIN_POSTGRES], "prior": 0.15})
        self.assertEqual(section["missing"], {"prior": 2, "sampled": 1, "bound": 2, "module": 2})
        self.assertEqual({k: section["prior"][k] for k in ("over", "callers", "graph", "importers")},
                         {"over": "reached files", "callers": None, "graph": None, "importers": None})
        self.assertEqual(self.result["summary"]["verdicts"], {"keep": 1, "provisional-keep": 1, "delete": 0, "unmeasured": 7, "accepted": 2})
        text = kills.report(self.result)
        self.assertNotIn("\nDelete\n", text)
        self.assertIn(f"{ACCEPTED_HEADING}  location prior {self.prior_file}\n", text)
        self.assertLess(text.index(ACCEPTED_HEADING),
                        text.index(f"\n  {UNIQUE}\n      module fe:quiet, prior 0.1, 5 mutants sampled, bound 0.6\n"))
        self.assertIn(f"  Over the module cap\n    fe:quiet\n      {TWIN_POSTGRES}\n", text)
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "verdicts.json")
            done = subprocess.run(
                [sys.executable, kills.__file__, "--index", INDEX, "--kills", self.kills_file,
                 *sum((["--candidates", c] for c in ACCEPT_CANDIDATES), []),
                 "--min-mutants", str(ACCEPT_MIN_MUTANTS), "--require-strata", "", "--prior", self.prior_file,
                 "--ci-history", self.ci_history_file, "--accept-cap", "2", "--out", out],
                stdout=subprocess.PIPE, text=True, check=True,
            )
            with open(out) as f:
                written = json.load(f)
        self.assertEqual(written["accepted"], section)
        self.assertIn(ACCEPTED_HEADING, done.stdout)

    def test_a_candidate_that_kills_none_of_its_mutants_needs_a_baseline_check(self):
        self.assertEqual((self.rows[UNIT]["verdict"], self.rows[UNIT]["acceptance"]["outcome"]), ("unmeasured", NEEDS_BASELINE))
        for tag, boot in (("stratum_coarse", boot_mutant([UNIT])), ("stratum", boot_mutant([UNIT], stratum="baseline"))):
            with self.subTest(tag):
                self.assertIn(UNIT, self.accepted(self.evaluate_entries(ACCEPT_KILLS | {"boot": boot})))

    def test_a_sampled_mutant_no_remaining_test_or_kept_candidate_kills_blocks_accepted(self):
        survivors = {
            "killed by nothing": (mutant("logic", [], [UNIQUE, REMAINING], L_UNIQUE), ACCEPT_CANDIDATES),
            "killed only unconfirmed": (
                mutant("logic", [], [UNIQUE, REMAINING], L_UNIQUE, unconfirmed_by=[REMAINING]), ACCEPT_CANDIDATES),
            "killed only by candidates that aren't kept": (
                mutant("logic", [FAILED, MISSING], [UNIQUE, FAILED, MISSING, REMAINING], L_UNIQUE), ACCEPT_CANDIDATES + [MISSING]),
        }
        for name, (survivor, candidate_ids) in survivors.items():
            with self.subTest(name):
                result = self.evaluate_entries(ACCEPT_KILLS | {"survivor": survivor}, candidate_ids=candidate_ids)
                row = result["candidates"][UNIQUE]
                a = row["acceptance"]
                self.assertEqual((row["verdict"], a["outcome"], a["survivors"], a["sampled"]),
                                 ("unmeasured", "survivor in sample", ["survivor"], 6))
                self.assertEqual(result["joint_check"], "ok")
        rows = result["candidates"]
        self.assertEqual({c: (rows[c]["verdict"], rows[c]["depends_on"]) for c in (FAILED, MISSING)},
                         {c: ("unmeasured", {"logic": {"survivor": []}}) for c in (FAILED, MISSING)})
        self.assertIn(f"  {FAILED}\n      unmeasured, no remaining test or kept candidate kills logic survivor\n", kills.report(result))

    def test_a_sampled_mutant_only_a_kept_candidate_kills_is_no_survivor(self):
        kept_kill = mutant("logic", [TWIN_MYSQL], [UNIQUE, TWIN_MYSQL, REMAINING], L_UNIQUE)
        result = self.evaluate_entries(ACCEPT_KILLS | {"kept-kill": kept_kill})
        rows = result["candidates"]
        self.assertEqual((rows[TWIN_MYSQL]["verdict"], rows[TWIN_MYSQL]["unique_kills"]), ("keep", {"logic": ["kept-kill"]}))
        a = rows[UNIQUE]["acceptance"]
        self.assertEqual((rows[UNIQUE]["verdict"], a["outcome"], a["survivors"], a["sampled"]), ("accepted", "accepted", [], 6))
        self.assertEqual((rows[UNIQUE]["depends_on"], result["joint_check"]), ({}, "ok"))

    def test_static_importers_are_recorded_and_never_gate(self):
        caller, barrel, app, unscored = (
            f"frontend/src/metabase/{name}" for name in ("caller.tsx", "public/index.ts", "App.tsx", "unscored.tsx"))
        prior = PRIOR | {"files": PRIOR["files"] | {
            caller: prior_entry("fe:elsewhere", 0.3), barrel: prior_entry("fe:public", 0.1), app: prior_entry("fe:app", 0.9)}}
        graph = {"barrels": [barrel], "importers": {
            L_UNIQUE["file"]: [caller], L_TWIN["file"]: [barrel], barrel: [app], L_PAIRED["file"]: [unscored]}}
        with tempfile.TemporaryDirectory() as d:
            prior_path, graph_path = os.path.join(d, "prior.json"), os.path.join(d, "prior-graph.json")
            for path, data in ((prior_path, prior), (graph_path, graph)):
                with open(path, "w") as f:
                    json.dump(data, f)
            result = self.evaluate(prior_path=prior_path)
        rows = result["candidates"]
        self.assertEqual({k: rows[TWIN_MYSQL]["acceptance"][k] for k in ("prior", "prior_over", "importers", "outcome")}, {
            "prior": {"score": 0.2, "files": {L_TWIN["file"]: 0.2}}, "prior_over": "reached files",
            "importers": {"role": "information only", "count": 2, "unscored": 0, "max": 0.9, "highest": {app: 0.9, barrel: 0.1}},
            "outcome": "accepted",
        })
        self.assertEqual((rows[PAIRED]["acceptance"]["importers"], rows[PAIRED]["acceptance"]["missing"]), (
            {"role": "information only", "count": 1, "unscored": 1, "max": None, "highest": {}},
            {"bound": "3/n bounds nothing for n = 3"}))

        def gate(row):
            a = row.get("acceptance") or {}
            return row["verdict"], a.get("outcome"), a.get("prior"), a.get("missing")

        self.assertEqual({c: gate(r) for c, r in rows.items()}, {c: gate(r) for c, r in self.rows.items()})
        self.assertEqual({k: result["accepted"]["prior"][k] for k in ("over", "graph", "importers")},
                         {"over": "reached files", "graph": graph_path, "importers": "information only"})
        self.assertIn(f"\n  {TWIN_MYSQL}\n      module fe:quiet, prior 0.2, 4 mutants sampled, bound 0.75\n"
                      "      2 static importers, highest score 0.9, information only\n", kills.report(result))

    def test_direct_callers_gate_when_given(self):
        hot, cool = (f"frontend/src/metabase/{name}" for name in ("hot.tsx", "cool.tsx"))
        prior = PRIOR | {"files": PRIOR["files"] | {hot: prior_entry("fe:hot", 0.9), cool: prior_entry("fe:cool", 0.1)}}
        callers = {UNIQUE: [hot], TWIN_MYSQL: [cool], TWIN_POSTGRES: []}
        with tempfile.TemporaryDirectory() as d:
            prior_path, callers_path, out = (os.path.join(d, name) for name in ("prior.json", "callers.json", "verdicts.json"))
            for path, data in ((prior_path, prior), (callers_path, callers)):
                with open(path, "w") as f:
                    json.dump(data, f)
            result = self.evaluate(prior_path=prior_path, callers_path=callers_path)
            subprocess.run(
                [sys.executable, kills.__file__, "--index", INDEX, "--kills", self.kills_file,
                 *sum((["--candidates", c] for c in ACCEPT_CANDIDATES), []),
                 "--min-mutants", str(ACCEPT_MIN_MUTANTS), "--require-strata", "", "--prior", prior_path,
                 "--callers", callers_path, "--ci-history", self.ci_history_file, "--accept-cap", "2", "--out", out],
                stdout=subprocess.DEVNULL, check=True,
            )
            with open(out) as f:
                written = json.load(f)
        rows = result["candidates"]
        self.assertEqual({c: (rows[c]["acceptance"]["prior"], rows[c]["acceptance"]["outcome"]) for c in (UNIQUE, TWIN_MYSQL, TWIN_POSTGRES)}, {
            UNIQUE: ({"score": 0.9, "files": {L_UNIQUE["file"]: 0.1}, "callers": {hot: 0.9}}, "prior above the maximum"),
            TWIN_MYSQL: ({"score": 0.2, "files": {L_TWIN["file"]: 0.2}, "callers": {cool: 0.1}}, "accepted"),
            TWIN_POSTGRES: ({"score": 0.2, "files": {L_TWIN["file"]: 0.2}, "callers": {}}, "accepted"),
        })
        self.assertEqual(rows[UNIT]["acceptance"]["missing"], {"prior": "no entry for it in the callers file"})
        self.assertEqual((rows[UNIQUE]["acceptance"]["prior_over"], result["accepted"]["prior"]["callers"]),
                         ("reached files plus direct callers", callers_path))
        self.assertEqual(written["accepted"], result["accepted"])

    def test_a_prior_above_the_maximum_stays_unmeasured(self):
        rows = self.evaluate(max_prior=0.15)["candidates"]
        self.assertEqual({c: rows[c]["acceptance"]["outcome"] for c in (UNIQUE, TWIN_MYSQL, TWIN_POSTGRES)},
                         {UNIQUE: "accepted", TWIN_MYSQL: "prior above the maximum", TWIN_POSTGRES: "prior above the maximum"})

    def test_ci_history_is_recorded_and_decides_nothing(self):
        self.assertEqual({c: self.rows[c]["acceptance"]["ci_history"] for c in (UNIQUE, TWIN_POSTGRES, UNIT)},
                         {UNIQUE: CI_HISTORY["tests"][UNIQUE], TWIN_POSTGRES: CI_HISTORY["tests"][TWIN_POSTGRES], UNIT: None})
        without = self.evaluate(ci_history_path=None)["candidates"]
        self.assertNotIn("ci_history", without[UNIQUE]["acceptance"])
        self.assertEqual({c: (r["verdict"], r.get("acceptance", {}).get("outcome")) for c, r in without.items()},
                         {c: (r["verdict"], r.get("acceptance", {}).get("outcome")) for c, r in self.rows.items()})


UNIT_MISSES = {f"unit-{i}": mutant("logic", [JEST], [UNIT, JEST], L_UNIT) for i in range(1, 5)}


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class DeleteChecks(unittest.TestCase):
    def verdict(self, entries, min_mutants, strata):
        """UNIT's verdict and reason for a kills file of these entries, which the pipeline must give too."""
        path = write_json(entries)
        try:
            row = kills.evaluate(INDEX, path, [UNIT], min_mutants, strata)["candidates"][UNIT]
            pipeline = pipeline_verdicts(path, [UNIT], min_mutants, strata)[UNIT]
        finally:
            os.unlink(path)
        self.assertEqual({f: pipeline.get(f) for f in COMPARED}, {f: row.get(f) for f in COMPARED})
        return row["verdict"], row["reason"]

    def test_a_candidate_that_kills_none_of_its_mutants_needs_a_baseline_check_before_delete(self):
        errored_boot = mutant("server-state", [REMAINING], [UNIT, REMAINING], errored=[UNIT]) | {"stratum_coarse": "baseline"}
        cases = {"no baseline mutant": UNIT_MISSES, "a baseline mutant it errored on": UNIT_MISSES | {"boot": errored_boot}}
        for name, entries in cases.items():
            with self.subTest(name):
                self.assertEqual(self.verdict(entries, 4, []), ("unmeasured", NEEDS_BASELINE))

    def test_a_baseline_mutant_run_or_a_kill_passes_the_baseline_check(self):
        cases = {
            "stratum_coarse baseline": UNIT_MISSES | {"boot": boot_mutant([UNIT])},
            "stratum baseline": UNIT_MISSES | {"boot": boot_mutant([UNIT], stratum="baseline")},
            "a kill": UNIT_MISSES | {"unit-1": mutant("logic", [UNIT, JEST], [UNIT, JEST], L_UNIT)},
        }
        for name, entries in cases.items():
            with self.subTest(name):
                self.assertEqual(self.verdict(entries, 4, []), ("delete", "no unique kill"))

    def test_required_strata_compare_the_coarse_stratum(self):
        logic = {"a": mutant("logic", [UNIT, JEST], [UNIT, JEST], L_UNIT)}
        cases = {
            "finer wiring name": ({"stratum": "intra-frontend-wiring"}, ("delete", "no unique kill")),
            "finer state name": ({"stratum": "store-state"}, ("unmeasured", "no qualifying wiring mutant")),
            "stratum_coarse over the finer name": ({"stratum": "store-state", "stratum_coarse": "wiring"}, ("delete", "no unique kill")),
        }
        for name, (tags, expected) in cases.items():
            with self.subTest(name):
                entries = logic | {"b": mutant("logic", [UNIT, JEST], [UNIT, JEST], L_UNIT) | tags}
                self.assertEqual(self.verdict(entries, 2, ["logic", "wiring"]), expected)


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


CHAIN = [BOOKMARKS, BOOKMARK_COLLECTION, BOOKMARK_MODEL]
CHAIN_KILLS = {
    "first-pair": mutant("logic", CHAIN[:2], CHAIN[:2] + [REMAINING]),
    "second-pair": mutant("wiring", CHAIN[1:], CHAIN[1:] + [REMAINING]),
}


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class JointDeletion(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kills_file = write_json(CHAIN_KILLS)
        cls.result = kills.evaluate(INDEX, cls.kills_file, CHAIN, 1, [])
        cls.rows = cls.result["candidates"]

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.kills_file)

    @staticmethod
    def middle_verdict(verdict):
        """kills.verdicts with the verdict of the chain's middle candidate replaced."""
        real = kills.verdicts

        def replaced(*args, **kwargs):
            rows = real(*args, **kwargs)
            rows[CHAIN[1]]["verdict"] = verdict
            return rows

        return mock.patch.object(kills, "verdicts", replaced)

    def command(self, *options):
        """The exit code, stdout and JSON of the command over the chain, with the middle candidate's verdict replaced by delete."""
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "verdicts.json")
            argv = [kills.__file__, "--index", INDEX, "--kills", self.kills_file, *sum((["--candidates", c] for c in CHAIN), []),
                    "--min-mutants", "1", "--require-strata", "", "--out", out, *options]
            stdout = io.StringIO()
            with self.middle_verdict("delete"), mock.patch.object(sys, "argv", argv), \
                    contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
                try:
                    kills.main()
                    code = 0
                except SystemExit as e:
                    code = e.code
            with open(out) as f:
                written = json.load(f)
        return code, stdout.getvalue(), written

    def test_a_chain_of_three_candidates_depends_on_the_one_in_the_middle(self):
        first, middle, last = CHAIN
        self.assertEqual({c: (r["verdict"], r["reason"], r.get("depends_on")) for c, r in self.rows.items()}, {
            first: ("delete", "no unique kill", {"logic": {"first-pair": [middle]}}),
            middle: ("keep", COVER_KEEPS, None),
            last: ("delete", "no unique kill", {"wiring": {"second-pair": [middle]}}),
        })
        self.assertEqual(self.result["joint_check"], "ok")
        pipeline = pipeline_verdicts(self.kills_file, CHAIN, 1, [])
        for cid in CHAIN:
            with self.subTest(cid):
                self.assertEqual({f: pipeline[cid].get(f) for f in COMPARED}, {f: self.rows[cid].get(f) for f in COMPARED})
        text = kills.report(self.result)
        self.assertIn(f"  {first}\n      delete, safe only while {middle} stay, for logic first-pair\n", text)
        self.assertIn(f"  {last}\n      delete, safe only while {middle} stay, for wiring second-pair\n", text)

    def test_the_joint_check_finds_a_mutant_that_only_deleted_or_unmeasured_candidates_kill(self):
        first, middle, last = CHAIN
        expected = {
            "delete": {"logic": {"first-pair": sorted([first, middle])}, "wiring": {"second-pair": sorted([middle, last])}},
            "accepted": {"logic": {"first-pair": sorted([first, middle])}, "wiring": {"second-pair": sorted([middle, last])}},
            "unmeasured": {"logic": {"first-pair": [first]}, "wiring": {"second-pair": [last]}},
        }
        for verdict, failures in expected.items():
            with self.subTest(verdict):
                with self.middle_verdict(verdict):
                    result = kills.evaluate(INDEX, self.kills_file, CHAIN, 1, [])
                self.assertEqual(result["joint_check"], failures)
                self.assertTrue(kills.report(result).startswith(
                    "Joint check: failed, 2 mutants killed by delete or accepted candidates and by no remaining test or kept candidate\n"
                    f"  logic first-pair\n      {failures['logic']['first-pair'][0]}\n"))

    def test_the_command_exits_with_code_1_on_a_failed_joint_check_unless_it_only_reports(self):
        code, text, written = self.command()
        self.assertEqual(code, "the joint check failed, which is a bug in the verdict rules: see the top of the report")
        self.assertTrue(text.startswith("Joint check: failed, 2 mutants"))
        self.assertEqual(set(written["joint_check"]), {"logic", "wiring"})
        code, text, written = self.command("--joint-check-report-only")
        self.assertEqual((code, set(written["joint_check"])), (0, {"logic", "wiring"}))
        self.assertTrue(text.startswith("Joint check: failed, 2 mutants"))


@unittest.skipUnless(INDEX and all(os.path.isfile(p) for p in (REAL_KILLS, REAL_CANDIDATES, REAL_PRIOR)),
                     "needs JOURNEY_LOOKUP_INDEX and the corpus files under JOURNEY_LOCAL_DIR")
class RealData(unittest.TestCase):
    def test_the_stranded_culls_pass_the_joint_check(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "verdicts.json")
            subprocess.run(
                [sys.executable, kills.__file__, "--index", INDEX, "--kills", REAL_KILLS, "--candidates", REAL_CANDIDATES,
                 "--prior", REAL_PRIOR, "--out", out],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )
            with open(out) as f:
                written = json.load(f)
        with open(REAL_KILLS) as f:
            killers = {mid: set(entry.get("killed_by") or []) for mid, entry in json.load(f).items()}
        rows = written["candidates"]
        stays = {cid for cid, r in rows.items() if r["verdict"] in kills.KEPT}

        def stays_killed(mid):
            return any(t not in rows or t in stays for t in killers[mid])

        self.assertEqual(written["joint_check"], "ok")
        deleted = {cid for cid, r in rows.items() if r["verdict"] in kills.DELETED}
        self.assertEqual([mid for mid, ks in killers.items() if ks & deleted and not stays_killed(mid)], [])
        for cid, row in rows.items():
            with self.subTest(cid):
                self.assertEqual("depends_on" in row, cid not in stays)
                for mids in (row.get("depends_on") or {}).values():
                    for mid, kept in mids.items():
                        self.assertIn(cid, killers[mid])
                        self.assertLessEqual(killers[mid], set(rows))
                        self.assertEqual(kept, sorted(killers[mid] & stays))
                survivors = (row.get("acceptance") or {}).get("survivors") or []
                self.assertEqual([mid for mid in survivors if stays_killed(mid)], [])


if __name__ == "__main__":
    unittest.main()
