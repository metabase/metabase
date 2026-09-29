"""Tests for kills.py, and for the location ledger's check against it.

The verdict and ledger tests need the reach index of run 36089233978 and its rerun, or of run 36482017221, and skip without one.
Their test ids and locations come from the stranded culls' reach counts.
The real-data test also needs the corpus kills file, the reach counts and the location prior,
from the `local/` folder of this checkout or JOURNEY_LOCAL_DIR, and skips without them.

  JOURNEY_LOOKUP_INDEX=<index dir> [JOURNEY_LOCAL_DIR=<local dir>] python3 e2e/coverage/journey/pipeline/test_kills.py
"""

import contextlib
import copy
import csv
import io
import json
import os
import re
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


def mutant(stratum, killed_by, ran, location=None, errored=(), file=None, unconfirmed_by=(), symptom_kills=(),
           symptom_unconfirmed_by=()):
    entry = {"killed_by": killed_by, "errored": list(errored), "ran": ran, "stratum": stratum, "origin": "synthetic"}
    for field, ids in (("unconfirmed_by", unconfirmed_by), ("symptom_kills", symptom_kills),
                       ("symptom_unconfirmed_by", symptom_unconfirmed_by)):
        if ids:
            entry[field] = list(ids)
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
    PAIRED: ("keep", f"{COVER_KEEPS}; missing-pair: not run by any remaining test"),
    BARE: ("unmeasured", "ran unknown"),
    ABSENT: ("unmeasured", "not in the kill matrix"),
    BACKEND: ("unmeasured", "1 qualifying mutants, fewer than 2"),
}
COMPARED = ("verdict", "reason", "unique_kills", "unconfirmed_unique_kills", "cover_kept_for", "kills", "misses", "errored",
            "qualifying_mutants", "qualifying_without_location", "qualifying_basis", "depends_on",
            "symptom_kills", "unconfirmed_symptom_kills", "symptom_only", "symptom_only_after_deletion", "also_killed_by_checker")
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
ELIGIBLE_HEADING = ("\nEligible for risk acceptance, which only a person's recorded acceptance makes accepted, "
                    "and never a measured delete\n")
ELIGIBLE = kills.ELIGIBLE


FLAT_BANNER = "Base unknown: the kills file is in the flat format, which records no revisions"


def without_banner(text):
    """The report after its first line when that is the flat format's provenance banner, which every flat kills file gets."""
    first, _, rest = text.partition("\n")
    return rest if first == FLAT_BANNER else text


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

    def test_the_cover_keeps_an_assertion_killer_over_a_symptom_killer(self):
        primary, secondary = [{"m"}, {"m"}], [{1, 2}, {1}]
        self.assertEqual(kills.kills_first_cover(primary, secondary, [1, 1]), ([0], 1))
        self.assertEqual(kills.kills_first_cover(primary, secondary, [1, 1], [{"m"}, set()]), ([1], 1))

    def test_the_cover_counts_the_new_kills_that_are_not_symptom_kills(self):
        primary, secondary = [{"a", "b"}, {"a", "b"}], [{1, 2}, {1}]
        self.assertEqual(kills.kills_first_cover(primary, secondary, [1, 1], [{"b"}, set()]), ([1], 2))
        self.assertEqual(kills.kills_first_cover(primary, secondary, [1, 1], [{"b"}, {"a"}]), ([0], 2))
        self.assertEqual(kills.kills_first_cover([{"a", "b", "c"}, {"a"}], [set(), {1}], [1, 1], [{"a", "b", "c"}, set()]), ([0], 3))

    def test_the_cover_drops_a_symptom_killer_first_when_either_of_two_could_go(self):
        assertion, symptom = {"m", "a1", "a2"}, {"m", "s1", "s2"}
        primary = [assertion, symptom, {"a1", "b1"}, {"a2", "c1"}, {"s1", "d1"}, {"s2", "e1"}]
        secondary = [set(), {1, 2, 3}, set(), set(), set(), set()]
        kept, _ = kills.kills_first_cover(primary, secondary, [1] * 6, [set(), {"m"}, set(), set(), set(), set()])
        self.assertEqual(sorted(kept), [0, 2, 3, 4, 5])

    def test_symptom_kills_leave_the_order_among_assertion_killers_unchanged(self):
        covers = [
            (([{"a", "b"}, {"b", "c"}, {"c", "d"}, {"a", "d"}], [{1}, {1, 2}, {3}, {1, 2, 3}], [1, 1, 1, 1]), [3, 1]),
            (([{"a", "b", "c"}, {"a"}, {"b"}, {"c", "d"}, {"d"}], [set(), {1, 2, 3}, {4}, {5}, {6, 7}], [3, 1, 2, 1, 1]), [0, 4]),
            (([{"m"}, {"m"}, {"m"}, {"n", "m"}, {"n"}], [{1}, {1, 2}, {3, 4, 5}, set(), {9}], [2, 1, 1, 1, 1]), [3]),
            (([{"a", "b"}, {"a", "b"}, {"c"}, {"c"}, {"b", "c"}], [{1, 2}, {3}, {4}, {4, 5}, set()], [1, 1, 1, 1, 1]), [0, 3]),
        ]
        for n, ((primary, secondary, costs), kept) in enumerate(covers):
            with self.subTest(n):
                none = [set() for _ in primary]
                self.assertEqual(kills.kills_first_cover(primary, secondary, costs)[0], kept)
                self.assertEqual(kills.kills_first_cover(primary, secondary, costs, none)[0], kept)
                with_symptom_killer = kills.kills_first_cover(
                    primary + [{"z"}], secondary + [set()], costs + [1], none + [{"z"}])[0]
                self.assertEqual([i for i in with_symptom_killer if i < len(primary)], kept)


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
        text = without_banner(kills.report(self.result))
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
        self.assertEqual(summary["verdicts"], {"keep": 2, "provisional-keep": 1, "delete": 1, "unmeasured": 2, ELIGIBLE: 0, "accepted": 0})
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
    def eligible(result):
        return {cid for cid, r in result["candidates"].items() if r["verdict"] == ELIGIBLE}

    def test_the_cap_makes_the_lowest_priors_eligible_first(self):
        self.assertEqual(self.eligible(self.result), {UNIQUE, TWIN_MYSQL})
        self.assertEqual(self.rows[UNIQUE]["eligibility"] | {"ci_history": None}, {
            "prior": {"score": 0.1, "files": {L_UNIQUE["file"]: 0.1}}, "prior_over": "reached files",
            "sampled": 5, "bound": 0.6, "modules": ["fe:quiet"], "missing": {}, "survivors": [], "outcome": "eligible",
            "ci_history": None,
        })
        self.assertEqual((self.rows[TWIN_MYSQL]["eligibility"]["bound"], self.rows[TWIN_MYSQL]["eligibility"]["prior"]["score"]), (0.75, 0.2))
        self.assertEqual((self.rows[TWIN_POSTGRES]["verdict"], self.rows[TWIN_POSTGRES]["eligibility"]["outcome"]),
                         ("unmeasured", "over the module cap"))

    def test_a_candidate_exactly_at_the_cap_is_eligible(self):
        self.assertEqual(self.eligible(self.evaluate(cap=3)), {UNIQUE, TWIN_MYSQL, TWIN_POSTGRES})
        self.assertEqual(self.eligible(self.evaluate(cap=1)), {UNIQUE})

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
                self.assertEqual((row["verdict"], row["eligibility"]["outcome"], row["eligibility"]["missing"]),
                                 ("unmeasured", "missing fields", missing))
        without_prior = self.evaluate(prior_path=None)
        self.assertEqual(self.eligible(without_prior), set())
        self.assertEqual(without_prior["candidates"][UNIQUE]["eligibility"]["missing"],
                         {"prior": "no location prior given", "module": "no location prior given"})

    def test_eligibility_never_overrides_keep_provisional_keep_or_a_failed_capture(self):
        result = self.evaluate(cap=100, max_prior=1)
        rows = result["candidates"]
        self.assertEqual([rows[c]["verdict"] for c in (REPRO_35009, REPRO_69160)], ["keep", "provisional-keep"])
        self.assertNotIn("eligibility", rows[REPRO_35009])
        self.assertNotIn("eligibility", rows[REPRO_69160])
        failed = rows[FAILED]
        self.assertEqual((failed["verdict"], failed["eligibility"]["missing"], failed["eligibility"]["outcome"]),
                         ("unmeasured", {}, "never: did not pass in the capture"))

    def test_risk_acceptance_has_its_own_section_in_the_output(self):
        section = self.result["risk_acceptance"]
        self.assertEqual((set(section["eligible"]), section["accepted"], section["data_warnings"]), ({UNIQUE, TWIN_MYSQL}, {}, []))
        self.assertEqual(section["modules"]["fe:quiet"],
                         {"eligible": sorted([UNIQUE, TWIN_MYSQL]), "over_cap": [TWIN_POSTGRES], "prior": 0.15})
        self.assertEqual(section["missing"], {"prior": 2, "sampled": 1, "bound": 2, "module": 2})
        self.assertEqual({k: section["prior"][k] for k in ("over", "callers", "graph", "importers")},
                         {"over": "reached files", "callers": None, "graph": None, "importers": None})
        self.assertEqual(self.result["summary"]["verdicts"],
                         {"keep": 1, "provisional-keep": 1, "delete": 0, "unmeasured": 7, ELIGIBLE: 2, "accepted": 0})
        text = kills.report(self.result)
        self.assertNotIn("\nDelete\n", text)
        self.assertIn(f"{ELIGIBLE_HEADING}  location prior {self.prior_file}\n", text)
        self.assertLess(text.index(ELIGIBLE_HEADING),
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
        self.assertEqual(written["risk_acceptance"], section)
        self.assertIn(ELIGIBLE_HEADING, done.stdout)

    def test_a_candidate_that_kills_none_of_its_mutants_needs_a_baseline_check(self):
        self.assertEqual((self.rows[UNIT]["verdict"], self.rows[UNIT]["eligibility"]["outcome"]), ("unmeasured", NEEDS_BASELINE))
        for tag, boot in (("stratum_coarse", boot_mutant([UNIT])), ("stratum", boot_mutant([UNIT], stratum="baseline"))):
            with self.subTest(tag):
                self.assertIn(UNIT, self.eligible(self.evaluate_entries(ACCEPT_KILLS | {"boot": boot})))

    def test_a_sampled_mutant_no_remaining_test_or_kept_candidate_kills_blocks_eligibility(self):
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
                a = row["eligibility"]
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
        a = rows[UNIQUE]["eligibility"]
        self.assertEqual((rows[UNIQUE]["verdict"], a["outcome"], a["survivors"], a["sampled"]), (ELIGIBLE, "eligible", [], 6))
        self.assertEqual((rows[UNIQUE]["depends_on"], result["joint_check"]), ({}, "ok"))

    def test_a_sampled_mutant_only_a_checker_kills_is_no_survivor(self):
        sampled = checked(mutant("logic", [], [UNIQUE, REMAINING], L_UNIQUE), "tsc")
        row = self.evaluate_entries(ACCEPT_KILLS | {"sampled": sampled})["candidates"][UNIQUE]
        self.assertEqual((row["verdict"], row["eligibility"]["survivors"], row["eligibility"]["sampled"]), (ELIGIBLE, [], 6))

    def test_a_sampled_mutant_only_a_remaining_symptom_kill_catches_is_no_survivor(self):
        cases = {
            "symptom kill": (mutant("logic", [REMAINING], [UNIQUE, REMAINING], L_UNIQUE, symptom_kills=[REMAINING]), (ELIGIBLE, [])),
            "errored": (mutant("logic", [], [UNIQUE, REMAINING], L_UNIQUE, errored=[REMAINING]), ("unmeasured", ["sampled"])),
        }
        for name, (sampled, (verdict, survivors)) in cases.items():
            with self.subTest(name):
                row = self.evaluate_entries(ACCEPT_KILLS | {"sampled": sampled})["candidates"][UNIQUE]
                self.assertEqual((row["verdict"], row["eligibility"]["survivors"]), (verdict, survivors))

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
        self.assertEqual({k: rows[TWIN_MYSQL]["eligibility"][k] for k in ("prior", "prior_over", "importers", "outcome")}, {
            "prior": {"score": 0.2, "files": {L_TWIN["file"]: 0.2}}, "prior_over": "reached files",
            "importers": {"role": "information only", "count": 2, "unscored": 0, "max": 0.9, "highest": {app: 0.9, barrel: 0.1}},
            "outcome": "eligible",
        })
        self.assertEqual((rows[PAIRED]["eligibility"]["importers"], rows[PAIRED]["eligibility"]["missing"]), (
            {"role": "information only", "count": 1, "unscored": 1, "max": None, "highest": {}},
            {"bound": "3/n bounds nothing for n = 3"}))

        def gate(row):
            a = row.get("eligibility") or {}
            return row["verdict"], a.get("outcome"), a.get("prior"), a.get("missing")

        self.assertEqual({c: gate(r) for c, r in rows.items()}, {c: gate(r) for c, r in self.rows.items()})
        self.assertEqual({k: result["risk_acceptance"]["prior"][k] for k in ("over", "graph", "importers")},
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
        self.assertEqual({c: (rows[c]["eligibility"]["prior"], rows[c]["eligibility"]["outcome"]) for c in (UNIQUE, TWIN_MYSQL, TWIN_POSTGRES)}, {
            UNIQUE: ({"score": 0.9, "files": {L_UNIQUE["file"]: 0.1}, "callers": {hot: 0.9}}, "prior above the maximum"),
            TWIN_MYSQL: ({"score": 0.2, "files": {L_TWIN["file"]: 0.2}, "callers": {cool: 0.1}}, "eligible"),
            TWIN_POSTGRES: ({"score": 0.2, "files": {L_TWIN["file"]: 0.2}, "callers": {}}, "eligible"),
        })
        self.assertEqual(rows[UNIT]["eligibility"]["missing"], {"prior": "no entry for it in the callers file"})
        self.assertEqual((rows[UNIQUE]["eligibility"]["prior_over"], result["risk_acceptance"]["prior"]["callers"]),
                         ("reached files plus direct callers", callers_path))
        self.assertEqual(written["risk_acceptance"], result["risk_acceptance"])

    def test_a_prior_above_the_maximum_stays_unmeasured(self):
        rows = self.evaluate(max_prior=0.15)["candidates"]
        self.assertEqual({c: rows[c]["eligibility"]["outcome"] for c in (UNIQUE, TWIN_MYSQL, TWIN_POSTGRES)},
                         {UNIQUE: "eligible", TWIN_MYSQL: "prior above the maximum", TWIN_POSTGRES: "prior above the maximum"})

    def test_ci_history_is_recorded_and_decides_nothing(self):
        self.assertEqual({c: self.rows[c]["eligibility"]["ci_history"] for c in (UNIQUE, TWIN_POSTGRES, UNIT)},
                         {UNIQUE: CI_HISTORY["tests"][UNIQUE], TWIN_POSTGRES: CI_HISTORY["tests"][TWIN_POSTGRES], UNIT: None})
        without = self.evaluate(ci_history_path=None)["candidates"]
        self.assertNotIn("ci_history", without[UNIQUE]["eligibility"])
        self.assertEqual({c: (r["verdict"], r.get("eligibility", {}).get("outcome")) for c, r in without.items()},
                         {c: (r["verdict"], r.get("eligibility", {}).get("outcome")) for c, r in self.rows.items()})


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


REPRO_61741 = ("e2e/test/scenarios/embedding/embedding-dashboard.cy.spec.js::scenarios > embedding > dashboard appearance "
               "should use transparent pivot table cells in static embedding's dark mode (metabase#61741)")
IFRAME = ("e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-iframe-embedding.cy.spec.ts::scenarios > embedding > "
          "modular embedding table visualization should span the full width of the container (metabase#69831)")
L_BOOT = fn_location("frontend/src/metabase/AppThemeProvider.tsx", "getColorSchemeFromDisplayTheme", 41, 39)


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class BaselineReach(unittest.TestCase):
    def test_every_candidate_that_loaded_the_app_reaches_boot_code_with_basis_baseline(self):
        kills_file = write_json({
            "boot": mutant("logic", [REMAINING], [REPRO_61741, IFRAME, UNIQUE, REMAINING], L_BOOT),
            "boot-and-hook": mutant("wiring", [REMAINING], [UNIQUE, REMAINING]) | {"locations": [L_BOOT, L_UNIQUE]},
        })
        try:
            result = kills.evaluate(INDEX, kills_file, [REPRO_61741, IFRAME, UNIQUE], 1, [])
        finally:
            os.unlink(kills_file)
        rows = result["candidates"]
        self.assertEqual({c: (rows[c]["reason"], rows[c]["qualifying_mutants"], rows[c]["qualifying_basis"]) for c in rows}, {
            REPRO_61741: (NEEDS_BASELINE, {"logic": 1}, {"baseline": ["boot"]}),
            IFRAME: ("0 qualifying mutants, fewer than 1", {}, {}),
            UNIQUE: (NEEDS_BASELINE, {"logic": 1, "wiring": 1},
                     {"baseline": ["boot", "boot-and-hook"], "subtraction": ["boot-and-hook"]}),
        })
        self.assertEqual([r["baseline_keys"] for r in result["mutants"]["boot-and-hook"]["locations"]], [1, 0])

    def test_the_lookup_marks_each_test_with_the_basis_of_its_reach(self):
        def lookup(location):
            done = subprocess.run(
                ["node", os.path.join(HERE, "..", "lookup", "lookup.mjs"), "--index", INDEX, "--json", json.dumps(location)],
                stdout=subprocess.PIPE, text=True, check=True,
            )
            return json.loads(done.stdout)

        boot = lookup(L_BOOT)
        self.assertEqual((boot["basis"][REPRO_61741], IFRAME in boot["reach"]), ("baseline", False))
        self.assertEqual(set(boot["basis"].values()), {"baseline"})
        self.assertEqual(boot["by_basis"]["subtraction"]["reach"], [])
        self.assertEqual(boot["by_basis"]["baseline"]["reach"], boot["reach"])
        loads = boot["by_basis"]["baseline"]["load"]
        with open(os.path.join(INDEX, "tests.json")) as f:
            records_pages = any("pages" in test for test in json.load(f))
        if records_pages:
            self.assertEqual(loads[REPRO_61741], "app")
            self.assertLessEqual(set(loads.values()), {"app", "embed", "public", "other", "unknown"})
        else:
            self.assertEqual(set(loads.values()), {"unknown"})
        measured = lookup(L_UNIQUE)
        self.assertEqual((set(measured["basis"].values()), "by_basis" in measured), ({"subtraction"}, False))


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
            ELIGIBLE: {"logic": {"first-pair": sorted([first, middle])}, "wiring": {"second-pair": sorted([middle, last])}},
            "accepted": {"logic": {"first-pair": sorted([first, middle])}, "wiring": {"second-pair": sorted([middle, last])}},
            "unmeasured": {"logic": {"first-pair": [first]}, "wiring": {"second-pair": [last]}},
        }
        for verdict, failures in expected.items():
            with self.subTest(verdict):
                with self.middle_verdict(verdict):
                    result = kills.evaluate(INDEX, self.kills_file, CHAIN, 1, [])
                self.assertEqual(result["joint_check"], failures)
                self.assertTrue(without_banner(kills.report(result)).startswith(
                    "Joint check: failed, 2 mutants killed by delete, eligible or accepted candidates and by no remaining test or kept candidate\n"
                    f"  logic first-pair\n      {failures['logic']['first-pair'][0]}\n"))

    def test_the_command_exits_with_code_1_on_a_failed_joint_check_unless_it_only_reports(self):
        code, text, written = self.command()
        self.assertEqual(code, "the joint check failed, which is a bug in the verdict rules: see the top of the report")
        self.assertTrue(without_banner(text).startswith("Joint check: failed, 2 mutants"))
        self.assertEqual(set(written["joint_check"]), {"logic", "wiring"})
        code, text, written = self.command("--joint-check-report-only")
        self.assertEqual((code, set(written["joint_check"])), (0, {"logic", "wiring"}))
        self.assertTrue(without_banner(text).startswith("Joint check: failed, 2 mutants"))


SYMPTOM_KILLS = {
    "unique-symptom": mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE, symptom_kills=[UNIQUE]),
    "paired-assertion": mutant("wiring", [PAIRED], [PAIRED, REMAINING], L_PAIRED),
    "paired-symptom": mutant("logic", [PAIRED], [PAIRED, REMAINING], L_PAIRED, symptom_kills=[PAIRED]),
    "unit-symptom": mutant("wiring", [UNIT, REMAINING], [UNIT, REMAINING], L_UNIT, symptom_kills=[REMAINING]),
    "unit-logic": mutant("logic", [JEST], [UNIT, JEST], L_UNIT),
    "69160-symptom": mutant("logic", [], [REPRO_69160, REMAINING], L_69160, unconfirmed_by=[REPRO_69160],
                            symptom_unconfirmed_by=[REPRO_69160]),
    "stray": mutant("logic", [REMAINING], [BACKEND, REMAINING], file=L_PARAMS["file"], symptom_kills=[REMAINING, BACKEND],
                    symptom_unconfirmed_by=[BACKEND]),
}
SYMPTOM_CANDIDATES = [UNIQUE, PAIRED, UNIT, REPRO_69160, BACKEND]
SYMPTOM_EXPECTED = {
    UNIQUE: ("keep", "unique kills, all symptom kills", True),
    PAIRED: ("keep", "unique kills", False),
    UNIT: ("delete", "no unique kill", False),
    REPRO_69160: ("provisional-keep", "unconfirmed unique kills, all symptom kills", True),
    BACKEND: ("unmeasured", "1 qualifying mutants, fewer than 2", False),
}
SYMPTOM_FIELDS = ("symptom_kills", "symptom_unconfirmed_by")


def without_symptoms(entries):
    return {mid: {k: v for k, v in m.items() if k not in SYMPTOM_FIELDS} for mid, m in entries.items()}


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class SymptomKills(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kills_file = write_json(SYMPTOM_KILLS)
        cls.result = kills.evaluate(INDEX, cls.kills_file, SYMPTOM_CANDIDATES, MIN_MUTANTS, STRATA)
        cls.rows = cls.result["candidates"]
        cls.text = kills.report(cls.result)

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.kills_file)

    @staticmethod
    def evaluate_entries(entries, candidate_ids, min_mutants=MIN_MUTANTS, strata=STRATA):
        path = write_json(entries)
        try:
            return kills.evaluate(INDEX, path, candidate_ids, min_mutants, strata)
        finally:
            os.unlink(path)

    def test_verdicts(self):
        for cid, (verdict, reason, symptom_only) in SYMPTOM_EXPECTED.items():
            with self.subTest(cid):
                row = self.rows[cid]
                self.assertEqual((row["verdict"], row["reason"], row["symptom_only"]), (verdict, reason, symptom_only))
        self.assertEqual(self.result["joint_check"], "ok")

    def test_a_keep_whose_only_unique_kill_is_a_symptom_kill_is_marked(self):
        row = self.rows[UNIQUE]
        self.assertEqual((row["unique_kills"], row["symptom_kills"]), ({"logic": ["unique-symptom"]}, {"logic": ["unique-symptom"]}))
        self.assertIn(f"  {UNIQUE}\n      unique kills, all symptom kills: logic 1\n      kept by the cover for logic unique-symptom\n"
                      "      symptom kills: logic unique-symptom\n", self.text)
        self.assertIn("\n     1  keep: unique kills, all symptom kills\n", self.text)

    def test_a_keep_with_an_assertion_kill_and_a_symptom_kill_is_not_marked(self):
        row = self.rows[PAIRED]
        self.assertEqual({k: row[k] for k in ("unique_kills", "symptom_kills")},
                         {"unique_kills": {"logic": ["paired-symptom"], "wiring": ["paired-assertion"]},
                          "symptom_kills": {"logic": ["paired-symptom"]}})
        self.assertIn(f"  {PAIRED}\n      unique kills: logic 1, wiring 1\n", self.text)
        self.assertIn("\n     1  keep: unique kills\n", self.text)

    def test_a_remaining_tests_symptom_kill_is_the_kill_a_delete_rests_on(self):
        row = self.rows[UNIT]
        self.assertEqual((row["depends_on"], row["symptom_only_after_deletion"], row["symptom_kills"]),
                         ({}, {"wiring": ["unit-symptom"]}, {}))
        self.assertIn(f"\nKills that stay only as symptom kills\n  {UNIT}\n"
                      "      delete, the tests that stay kill wiring unit-symptom only through symptom kills\n", self.text)
        as_errored = SYMPTOM_KILLS | {"unit-symptom": mutant("wiring", [UNIT], [UNIT, REMAINING], L_UNIT, errored=[REMAINING])}
        row = self.evaluate_entries(as_errored, [UNIT])["candidates"][UNIT]
        self.assertEqual((row["verdict"], row["unique_kills"], row.get("symptom_only_after_deletion")),
                         ("keep", {"wiring": ["unit-symptom"]}, None))

    def test_a_provisional_keep_on_an_unconfirmed_symptom_kill_is_marked(self):
        row = self.rows[REPRO_69160]
        self.assertEqual((row["unconfirmed_unique_kills"], row["unconfirmed_symptom_kills"], row["symptom_kills"]),
                         ({"logic": ["69160-symptom"]}, {"logic": ["69160-symptom"]}, {}))
        self.assertIn(f"  {REPRO_69160}\n      unconfirmed unique kills, all symptom kills: logic 1\n"
                      "      kept by the cover for logic 69160-symptom\n      unconfirmed symptom kills: logic 69160-symptom\n", self.text)

    def test_the_summary_counts_symptom_kills(self):
        self.assertEqual(self.result["summary"]["symptom_kills"], {
            "kills": 4, "symptom_kills": 2, "unconfirmed_symptom_kills": 1,
            "resting_only_on_symptom_kills": {"keep": 1, "provisional-keep": 1},
        })
        self.assertEqual(self.result["kills"]["symptom_kills"], {
            "kills": 7, "symptom_kills": 4, "unconfirmed_kills": 1, "unconfirmed_symptom_kills": 1,
            "mutants_resting_only_on_symptom_kills": 4, "ignored": {"symptom_kills": 1, "symptom_unconfirmed_by": 1},
        })
        self.assertIn("\nSymptom kills\n  4 of the kills file's 7 kills are symptom kills, and 1 of its 1 unconfirmed kills\n", self.text)
        self.assertIn("  2 of the candidates' 4 kills are symptom kills, and they have 1 unconfirmed symptom kills\n"
                      "  1 keeps and 1 provisional-keeps rest only on symptom kills\n", self.text)
        self.assertIn("\n1 ids in `symptom_kills` aren't in their mutant's `killed_by`, and are ignored\n", self.text)
        self.assertTrue(self.text.endswith("\n1 ids in `symptom_unconfirmed_by` aren't in their mutant's `unconfirmed_by`, and are ignored"))

    def test_a_kills_file_without_symptom_fields_has_no_symptom_kills(self):
        result = self.evaluate_entries(without_symptoms(SYMPTOM_KILLS), SYMPTOM_CANDIDATES)
        rows = result["candidates"]
        self.assertEqual({c: (r["verdict"], r["reason"]) for c, r in rows.items()},
                         {c: (v, reason.replace(", all symptom kills", "")) for c, (v, reason, _) in SYMPTOM_EXPECTED.items()})
        for cid, row in rows.items():
            with self.subTest(cid):
                self.assertEqual({k: row.get(k) for k in ("symptom_kills", "unconfirmed_symptom_kills", "symptom_only")},
                                 {"symptom_kills": {}, "unconfirmed_symptom_kills": {}, "symptom_only": False})
                self.assertEqual(row.get("symptom_only_after_deletion", {}), {})
        self.assertEqual(result["kills"]["symptom_kills"]["mutants_resting_only_on_symptom_kills"], 0)
        self.assertEqual(result["summary"]["symptom_kills"]["resting_only_on_symptom_kills"], {"keep": 0, "provisional-keep": 0})
        self.assertNotIn("\nSymptom kills\n", kills.report(result))

    def test_a_bare_list_entry_has_no_symptom_kills(self):
        row = self.evaluate_entries({"bare": [UNIQUE]}, [UNIQUE], 1, [])["candidates"][UNIQUE]
        self.assertEqual((row["verdict"], row["reason"], row["symptom_kills"], row["symptom_only"]),
                         ("keep", "unique kills; bare: not run by any remaining test", {}, False))

    def test_the_joint_check_counts_symptom_kills(self):
        first, middle, last = CHAIN
        chain = {mid: m | {"symptom_kills": [middle]} for mid, m in CHAIN_KILLS.items()}
        result = self.evaluate_entries(chain, CHAIN, 1, [])
        self.assertEqual({c: (r["verdict"], r["reason"], r.get("depends_on"), r.get("symptom_only_after_deletion"))
                          for c, r in result["candidates"].items()}, {
            first: ("delete", "no unique kill", {"logic": {"first-pair": [middle]}}, {"logic": ["first-pair"]}),
            middle: ("keep", f"{COVER_KEEPS}, all symptom kills", None, None),
            last: ("delete", "no unique kill", {"wiring": {"second-pair": [middle]}}, {"wiring": ["second-pair"]}),
        })
        self.assertEqual(result["joint_check"], "ok")
        with JointDeletion.middle_verdict("delete"):
            deleted = self.evaluate_entries(chain, CHAIN, 1, [])
        self.assertEqual(deleted["joint_check"],
                         {"logic": {"first-pair": sorted([first, middle])}, "wiring": {"second-pair": sorted([middle, last])}})
        one = CHAIN_KILLS | {"first-pair": CHAIN_KILLS["first-pair"] | {"symptom_kills": [middle]}}
        rows = self.evaluate_entries(one, CHAIN, 1, [])["candidates"]
        self.assertEqual({c: (r["reason"], r.get("symptom_only_after_deletion")) for c, r in rows.items()}, {
            first: ("no unique kill", {"logic": ["first-pair"]}),
            middle: (COVER_KEEPS, None),
            last: ("no unique kill", {}),
        })

    def test_the_cover_keeps_the_twin_that_kills_with_an_assertion(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        for symptom_twin, kept in ((TWIN_MYSQL, TWIN_POSTGRES), (TWIN_POSTGRES, TWIN_MYSQL)):
            cases = {
                "confirmed": (mutant("logic", twins, twins + [REMAINING], L_TWIN, symptom_kills=[symptom_twin]),
                              ("keep", COVER_KEEPS)),
                "unconfirmed": (mutant("logic", [], twins + [REMAINING], L_TWIN, unconfirmed_by=twins,
                                       symptom_unconfirmed_by=[symptom_twin]), ("provisional-keep", COVER_KEEPS_UNCONFIRMED)),
            }
            for name, (shared, verdict) in cases.items():
                with self.subTest(f"{name}, {symptom_twin}"):
                    result = self.evaluate_entries({"twins": shared}, twins, 1, [])
                    self.assertEqual(result["kills_cover"]["kept"], [kept])
                    row = result["candidates"][kept]
                    self.assertEqual((row["verdict"], row["reason"]), verdict)

    def test_pipeline_gives_the_same_verdicts(self):
        pipeline = pipeline_verdicts(self.kills_file, SYMPTOM_CANDIDATES)
        for cid in SYMPTOM_CANDIDATES:
            with self.subTest(cid):
                self.assertEqual({f: pipeline[cid].get(f) for f in COMPARED}, {f: self.rows[cid].get(f) for f in COMPARED})


def checked(entry, layer, confirmed=True, result="killed", at=None):
    """The entry with a checker's kill recorded as the kills file records it, in `killed_at_layer` and in `layer_results`."""
    return entry | {"killed_at_layer": at or layer, "kill_confirmed": confirmed, "layer_results": {layer: {"result": result}}}


CHECKED = mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE)
CHECKER_CASES = {
    "type checker": (checked(CHECKED, "tsc"), ["type checker"], False),
    "contract checker": (checked(CHECKED, "contract"), ["contract checker"], False),
    "contract checker in layer_results only": (CHECKED | {"layer_results": {"contract": {"result": "killed"}}}, ["contract checker"], False),
    "both, the contract checker in layer_results only": (
        checked(CHECKED, "tsc") | {"layer_results": {"tsc": {"result": "killed"}, "contract": {"result": "killed"}}},
        ["type checker", "contract checker"], False),
    "killed_at_layer only, with layer_results that disagree": (checked(CHECKED, "tsc", result="survived"), ["type checker"], True),
    "layer_results only, with kill_confirmed false": (checked(CHECKED, "tsc", confirmed=False, at="none"), ["type checker"], True),
}
UNCOUNTED_CASES = {
    "unconfirmed": checked(CHECKED, "tsc", confirmed=False, result="unconfirmed"),
    "survived": checked(CHECKED, "tsc", result="survived", at="e2e"),
    "no checker fields": CHECKED,
}


def ledger_run(entries, candidate_ids, min_mutants, strata, *options):
    """The ledger of a kills file of these entries, and ledger-verdicts.mjs's check of it against kills.py's verdicts."""
    lookup = os.path.join(HERE, "..", "lookup")
    with tempfile.TemporaryDirectory() as d:
        kills_file, candidates, verdicts, out = (os.path.join(d, n) for n in ("kills.json", "candidates.txt", "verdicts.json", "ledger"))
        with open(kills_file, "w") as f:
            json.dump(entries, f)
        with open(candidates, "w") as f:
            f.write("\n".join(candidate_ids) + "\n")
        subprocess.run(
            [sys.executable, kills.__file__, "--index", INDEX, "--kills", kills_file, "--candidates", candidates,
             "--min-mutants", str(min_mutants), "--require-strata", ",".join(strata), "--out", verdicts, *options],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )
        subprocess.run(
            ["node", os.path.join(lookup, "ledger.mjs"), "--index", INDEX, "--kills", kills_file,
             "--candidates", candidates, "--out", out, *options],
            stdout=subprocess.DEVNULL, check=True,
        )
        check = subprocess.run(
            ["node", os.path.join(lookup, "ledger-verdicts.mjs"), "--ledger", os.path.join(out, "ledger.json"),
             "--verdicts", verdicts, "--candidates", candidates],
            stdout=subprocess.PIPE, text=True,
        )
        with open(os.path.join(out, "ledger.json")) as f:
            ledger = json.load(f)
        with open(os.path.join(out, "ledger.csv")) as f:
            csv_rows = list(csv.DictReader(f))
        with open(os.path.join(out, "summary.md")) as f:
            summary = f.read()
        with open(verdicts) as f:
            result = json.load(f)
    return types.SimpleNamespace(ledger=ledger, csv=csv_rows, summary=summary, check=check, result=result)


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class Ledger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.joined = ledger_run(SYMPTOM_KILLS, SYMPTOM_CANDIDATES, MIN_MUTANTS, STRATA)

    def test_the_ledger_gives_kills_py_verdicts_with_their_symptom_markers(self):
        self.assertEqual(self.joined.check.returncode, 0, self.joined.check.stdout)
        self.assertIn(f"Keeps and provisional-keeps that rest only on symptom kills, from the ledger: {UNIQUE} (keep); "
                      f"{REPRO_69160} (provisional-keep)\n", self.joined.check.stdout)

    def test_each_mutant_says_whether_it_rests_only_on_symptom_kills(self):
        mutants = self.joined.ledger["mutants"]
        self.assertEqual({mid: m["symptom_only"] for mid, m in mutants.items()}, {
            "unique-symptom": True, "paired-assertion": False, "paired-symptom": True, "unit-symptom": False,
            "unit-logic": False, "69160-symptom": True, "stray": True,
        })
        self.assertEqual((mutants["unit-symptom"]["symptom_kills"], mutants["69160-symptom"]["symptom_unconfirmed_by"]),
                         ({"e2e": [REMAINING]}, {"e2e": [REPRO_69160]}))
        self.assertEqual(mutants["stray"]["symptom_ids_ignored"], {"symptom_kills": 1, "symptom_unconfirmed_by": 1})
        self.assertEqual({r["mutant"]: r["symptom_only"] for r in self.joined.csv if r["mutant"] in ("unit-symptom", "stray")},
                         {"unit-symptom": "no", "stray": "yes"})

    def test_symptom_kills_count_on_the_e2e_floor_and_off_the_demand_list(self):
        ledger = self.joined.ledger
        self.assertEqual({s: (g["mutants"], g["symptom_only"]) for s, g in ledger["e2e_floor"].items()}, {
            "logic": (["paired-symptom", "stray", "unique-symptom"], ["paired-symptom", "stray", "unique-symptom"]),
            "wiring": (["paired-assertion", "unit-symptom"], []),
        })
        self.assertEqual({s: (g["mutants"], g["symptom_only"]) for s, g in ledger["demand"].items()},
                         {"logic": (["69160-symptom"], ["69160-symptom"])})
        self.assertIn("Symptom kills count as kills: 4 confirmed, on 4 mutants, and 1 unconfirmed, on 1 mutants. "
                      "4 mutants rest only on symptom kills", self.joined.summary)
        self.assertIn("\n1 of them rest only on symptom kills: logic 1.\n", self.joined.summary)
        self.assertIn("\n3 of them rest only on symptom kills: logic 3.\n", self.joined.summary)
        self.assertIn("| logic | 1 | 1 | 1 | 1 | 1 | not routed 1 |", self.joined.summary)

    def test_the_ledger_needs_a_baseline_check_where_kills_py_does(self):
        run = ledger_run(UNIT_MISSES, [UNIT], 4, [])
        self.assertEqual(run.check.returncode, 0, run.check.stdout)
        self.assertIn('Verdicts from the ledger: {"unmeasured":1}', run.check.stdout)

    def test_the_ledger_compares_required_strata_by_coarse_stratum(self):
        finer = {"a": mutant("extreme", [UNIT, JEST], [UNIT, JEST], L_UNIT) | {"stratum_coarse": "logic"},
                 "b": mutant("intra-frontend-wiring", [UNIT, JEST], [UNIT, JEST], L_UNIT)}
        run = ledger_run(finer, [UNIT], 2, ["logic", "wiring"])
        self.assertEqual(run.check.returncode, 0, run.check.stdout)
        self.assertIn('Verdicts from the ledger: {"delete":1}', run.check.stdout)

    def test_the_ledger_cover_keeps_the_twin_that_kills_with_an_assertion(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        for symptom_twin, kept in ((TWIN_MYSQL, TWIN_POSTGRES), (TWIN_POSTGRES, TWIN_MYSQL)):
            with self.subTest(symptom_twin):
                shared = mutant("logic", twins, twins + [REMAINING], L_TWIN, symptom_kills=[symptom_twin])
                run = ledger_run({"twins": shared}, twins, 1, [])
                self.assertEqual(run.check.returncode, 0, run.check.stdout)
                self.assertEqual(run.result["kills_cover"]["kept"], [kept])

    def test_an_older_kills_file_gives_the_same_verdicts_without_markers(self):
        run = ledger_run(without_symptoms(SYMPTOM_KILLS), SYMPTOM_CANDIDATES, MIN_MUTANTS, STRATA)
        self.assertEqual(run.check.returncode, 0, run.check.stdout)
        self.assertEqual({m["symptom_only"] for m in run.ledger["mutants"].values()}, {False})
        self.assertNotIn("Symptom kills count as kills", run.summary)
        self.assertNotIn("rest only on symptom kills", run.summary)


def suspect(entry):
    return entry | {"equivalent_suspect": True}


EQUIVALENT_KILLS = SYMPTOM_KILLS | {
    "equivalent-alone": suspect(mutant("wiring", [], [REMAINING], L_TWIN) | {"routed_to": "e2e"}),
    "equivalent-sampled": suspect(mutant("logic", [], [UNIT, REMAINING], L_UNIT)),
    "equivalent-killed": suspect(mutant("logic", [PAIRED], [PAIRED, REMAINING], L_PAIRED)),
}
SUSPECTS = ("equivalent-alone", "equivalent-sampled", "equivalent-killed")


def without_suspects(entries):
    return {mid: {k: v for k, v in m.items() if k != "equivalent_suspect"} for mid, m in entries.items()}


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class EquivalentSuspects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.marked = ledger_run(EQUIVALENT_KILLS, SYMPTOM_CANDIDATES, MIN_MUTANTS, STRATA)
        cls.unmarked = ledger_run(without_suspects(EQUIVALENT_KILLS), SYMPTOM_CANDIDATES, MIN_MUTANTS, STRATA)

    @staticmethod
    def groups(ledger, key):
        return {s: g["mutants"] for s, g in ledger[key].items()}

    @staticmethod
    def csv_marks(run):
        return {r["mutant"]: (r["cheapest_killing_layer"], r["equivalent_suspect"]) for r in run.csv if r["mutant"]}

    def test_a_suspected_equivalent_mutant_nobody_kills_is_off_the_demand_list(self):
        ledger = self.marked.ledger
        self.assertEqual(self.groups(ledger, "demand"), {"logic": ["69160-symptom"]})
        self.assertEqual(self.groups(ledger, "equivalent_suspect"),
                         {"logic": ["equivalent-sampled"], "wiring": ["equivalent-alone"]})
        self.assertEqual((ledger["demand_rows_with_an_unkilled_mutant"], ledger["demand_rows_without_any_killer"]), (1, 1))
        self.assertIn("\nMutants with no confirmed killer at any layer, leaving out 2 suspected equivalent ones: "
                      "logic 1 mutants in 1 rows.\n", self.marked.summary)
        self.assertIn("\n1 rows hold at least one of them, and 1 rows have no killed mutant at all.\n"
                      "Routed by the kills file, as a judgement: not routed 1.\n", self.marked.summary)
        self.assertIn("| logic | 1 | 1 | 1 | 1 | 1 | not routed 1 |\n\n", self.marked.summary)
        self.assertIn("\n## Suspected equivalent\n\nThe kills file marks 3 mutants `equivalent_suspect`. No test can kill an "
                      "equivalent mutant, so the ones with no confirmed killer are off the demand list: "
                      "logic 1 mutants in 1 rows, wiring 1 mutants in 1 rows.\n", self.marked.summary)
        marks = self.csv_marks(self.marked)
        self.assertEqual({mid: marks[mid] for mid in ("equivalent-alone", "equivalent-sampled", "69160-symptom")}, {
            "equivalent-alone": ("none", "yes"), "equivalent-sampled": ("none", "yes"), "69160-symptom": ("none", "no"),
        })

    def test_a_suspected_equivalent_mutant_that_a_test_kills_stays_on_the_floor(self):
        ledger = self.marked.ledger
        self.assertEqual(ledger["mutants"]["equivalent-killed"]["cheapest_layer"], "e2e")
        self.assertIn("equivalent-killed", ledger["e2e_floor"]["logic"]["mutants"])
        self.assertEqual(ledger["e2e_floor"], self.unmarked.ledger["e2e_floor"])
        self.assertEqual(self.groups(ledger, "equivalent_suspect_killed"), {"logic": ["equivalent-killed"]})
        self.assertIn("\n1 of them have a confirmed kill, so the mark is wrong for them, and they keep their cheapest layer: "
                      "equivalent-killed (e2e).\n", self.marked.summary)
        self.assertEqual(self.csv_marks(self.marked)["equivalent-killed"], ("e2e", "yes"))

    def test_an_unresolved_suspect_gets_no_sample_credit_and_a_killed_one_counts_as_killed(self):
        self.assertEqual([mid for mid, m in self.marked.ledger["mutants"].items() if m.get("equivalent_suspect")],
                         list(SUSPECTS))
        for run in (self.marked, self.unmarked):
            self.assertEqual(run.check.returncode, 0, run.check.stdout)
            self.assertEqual(run.result["joint_check"], "ok")
        marked, unmarked = self.marked.result["candidates"], self.unmarked.result["candidates"]
        self.assertNotIn("equivalent-sampled", marked[UNIT]["qualifying_basis"]["subtraction"])
        self.assertIn("equivalent-sampled", unmarked[UNIT]["qualifying_basis"]["subtraction"])
        self.assertEqual((marked[UNIT]["equivalent_suspects"], unmarked[UNIT]["equivalent_suspects"]),
                         ({"equivalent-sampled": "unresolved"}, {}))
        self.assertEqual(marked[PAIRED]["unique_kills"], unmarked[PAIRED]["unique_kills"])
        self.assertIn("equivalent-killed", marked[PAIRED]["unique_kills"]["logic"])
        self.assertEqual({mid: self.marked.result["mutants"][mid]["equivalent_suspect"]["state"] for mid in SUSPECTS},
                         {"equivalent-alone": "unresolved", "equivalent-sampled": "unresolved", "equivalent-killed": "killed"})
        self.assertEqual({mid: m["equivalence_state"] for mid, m in self.marked.ledger["mutants"].items() if "equivalence_state" in m},
                         {"equivalent-alone": "unresolved", "equivalent-sampled": "unresolved", "equivalent-killed": "killed"})
        self.assertIn("Among the ones with no confirmed kill, 2 are unresolved (equivalent-alone, equivalent-sampled)", self.marked.summary)

    def test_an_older_kills_file_marks_no_mutant(self):
        ledger = self.unmarked.ledger
        self.assertEqual(self.groups(ledger, "demand"),
                         {"logic": ["69160-symptom", "equivalent-sampled"], "wiring": ["equivalent-alone"]})
        self.assertEqual((ledger["demand_rows_with_an_unkilled_mutant"], ledger["demand_rows_without_any_killer"]), (3, 2))
        self.assertEqual((ledger["equivalent_suspect"], ledger["equivalent_suspect_killed"]), ({}, {}))
        self.assertNotIn("Suspected equivalent", self.unmarked.summary)
        self.assertNotIn("equivalent_suspect", self.unmarked.summary)
        self.assertEqual({mark for _, mark in self.csv_marks(self.unmarked).values()}, {"no"})


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class CheckerKills(unittest.TestCase):
    @staticmethod
    def evaluate_entries(entries, candidate_ids, min_mutants=1, strata=()):
        path = write_json(entries)
        try:
            return kills.evaluate(INDEX, path, candidate_ids, min_mutants, list(strata))
        finally:
            os.unlink(path)

    def test_a_kill_a_checker_also_makes_is_not_unique(self):
        for name, (entry, names, disagree) in CHECKER_CASES.items():
            with self.subTest(name):
                result = self.evaluate_entries({"checked": entry}, [UNIQUE])
                row = result["candidates"][UNIQUE]
                self.assertEqual((row["verdict"], row["reason"], row["unique_kills"], row["cover_kept_for"]),
                                 ("delete", "no unique kill", {}, {}))
                self.assertEqual((row["also_killed_by_checker"], row["depends_on"], row["symptom_only_after_deletion"]),
                                 ({"logic": {"checked": names}}, {}, {}))
                self.assertEqual((result["joint_check"], result["kills_cover"]["kept"]), ("ok", []))
                self.assertEqual(result["kills"]["checker_disagreements"], ["checked"] if disagree else [])

    def test_an_unconfirmed_or_missing_checker_kill_leaves_a_unique_kill(self):
        for name, entry in UNCOUNTED_CASES.items():
            with self.subTest(name):
                result = self.evaluate_entries({"checked": entry}, [UNIQUE])
                row = result["candidates"][UNIQUE]
                self.assertEqual((row["verdict"], row["reason"], row["unique_kills"], row["also_killed_by_checker"]),
                                 ("keep", "unique kills", {"logic": ["checked"]}, {}))
                self.assertEqual(result["kills"]["checker_kills"], {"type checker": 0, "contract checker": 0})

    def test_the_cover_keeps_no_twin_for_a_kill_a_checker_also_makes(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        result = self.evaluate_entries({"twins": checked(mutant("logic", twins, twins + [REMAINING], L_TWIN), "tsc")}, twins)
        self.assertEqual(result["kills_cover"]["kept"], [])
        self.assertEqual({t: result["candidates"][t]["verdict"] for t in twins}, {t: "delete" for t in twins})

    def test_the_report_names_the_checker(self):
        result = self.evaluate_entries({"checked": CHECKER_CASES["killed_at_layer only, with layer_results that disagree"][0]}, [UNIQUE])
        text = kills.report(result)
        self.assertIn("\n1 mutants: logic 1\n  1 killed by the type checker, 0 killed by the contract checker, which count as remaining tests\n",
                      text)
        self.assertIn(f"\nKills a checker also makes\n  {UNIQUE}\n      delete, the type checker also kills logic checked\n", text)
        self.assertIn("\n1 mutants record a checker kill differently in `killed_at_layer` and `layer_results`: checked", text)

    def test_pipeline_gives_the_same_verdicts(self):
        path = write_json({"checked": CHECKER_CASES["type checker"][0], "shared": CHECKER_CASES["contract checker"][0]})
        try:
            rows = kills.evaluate(INDEX, path, [UNIQUE], 1, [])["candidates"]
            pipeline = pipeline_verdicts(path, [UNIQUE], 1, [])
        finally:
            os.unlink(path)
        self.assertEqual({f: pipeline[UNIQUE].get(f) for f in COMPARED}, {f: rows[UNIQUE].get(f) for f in COMPARED})

    def test_the_ledger_counts_checker_kills_as_kills_py_does(self):
        entries = {f"case-{n}": entry for n, (entry, _, _) in enumerate(CHECKER_CASES.values())}
        entries |= {f"uncounted-{n}": entry for n, entry in enumerate(UNCOUNTED_CASES.values())}
        run = ledger_run(entries, [UNIQUE], 1, [])
        self.assertEqual(run.check.returncode, 0, run.check.stdout)
        self.assertEqual(run.result["candidates"][UNIQUE]["unique_kills"], {"logic": ["uncounted-0", "uncounted-1", "uncounted-2"]})
        mutants = run.ledger["mutants"]
        self.assertEqual({mid: (m["checker_kills"], m.get("checker_disagreement", False)) for mid, m in mutants.items()},
                         {**{f"case-{n}": (names, disagree) for n, (_, names, disagree) in enumerate(CHECKER_CASES.values())},
                          **{f"uncounted-{n}": ([], False) for n in range(len(UNCOUNTED_CASES))}})
        self.assertIn("- Checker kills, from `killed_at_layer` with `kill_confirmed` or from `layer_results`: type checker 4, "
                      "contract checker 3.", run.summary)
        self.assertIn("- 2 mutants record a checker kill differently in `killed_at_layer` and `layer_results`: case-4, case-5.",
                      run.summary)
        self.assertEqual({r["mutant"]: r["checker_kills"] for r in run.csv if r["mutant"] in ("case-3", "uncounted-0")},
                         {"case-3": "type checker;contract checker", "uncounted-0": ""})


class Ordinals(unittest.TestCase):
    SPEC = "e2e/test/scenarios/filters/filter.cy.spec.js"
    TITLE = "scenarios > question > filter should convert negative filter to custom expression (metabase#14880)"
    FIRST = f"{SPEC}::{TITLE}"
    SECOND = f"{FIRST} [2]"
    ALONE = UNIQUE
    LOCATION = fn_location("frontend/src/metabase/querying/filters/utils.ts", "negate", 12, 2)

    def test_a_title_stands_for_every_index_test_with_it(self):
        index_tests = [
            {"id": self.FIRST, "spec": self.SPEC, "title": self.TITLE},
            {"id": self.SECOND, "spec": self.SPEC, "title": self.TITLE},
            {"id": self.ALONE, "spec": UNIQUE.split("::")[0], "title": UNIQUE.split("::", 1)[1]},
        ]
        self.assertEqual(kills.ordinal_members(index_tests, [self.FIRST, self.SECOND, self.ALONE, ABSENT]), {
            self.FIRST: [self.FIRST, self.SECOND],
            self.SECOND: [self.SECOND],
            self.ALONE: [self.ALONE],
            ABSENT: [ABSENT],
        })

    def test_merged_tests_pass_only_when_all_of_them_passed(self):
        tests = {self.FIRST: {"state": "passed", "keys": [3, 1]}, self.SECOND: {"state": "failed", "keys": [2, 3]}}
        members = {self.FIRST: [self.FIRST, self.SECOND], self.SECOND: [self.SECOND], ABSENT: [ABSENT]}
        self.assertEqual(kills.merge_ordinals(tests, members), {
            self.FIRST: {"state": "failed", "keys": [1, 2, 3]},
            self.SECOND: {"state": "failed", "keys": [2, 3]},
        })

    def evaluate(self, second_state):
        """Verdicts for the title, with a mutant that only its second test reaches, over a stub of reach.mjs."""
        kills_matrix = {"negate": mutant("logic", [REMAINING], [self.FIRST, REMAINING], self.LOCATION)}
        reach = {
            "sha": "8317274709c", "runs": ["36482017221"],
            "tests": {self.FIRST: {"state": "passed", "keys": [1]}, self.SECOND: {"state": second_state, "keys": [2]}},
            "locations": {"negate": {"resolved": [{"file": self.LOCATION["file"], "keys": 1, "notes": []}],
                                     "reach": [self.SECOND], "reach_by_basis": {"subtraction": [self.SECOND]}}},
        }
        asked = []

        def index_reach(index_dir, test_ids, locations, repo=None, sha=None):
            asked.extend(test_ids)
            return reach

        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "tests.json"), "w") as f:
                json.dump([{"id": i, "spec": self.SPEC, "title": self.TITLE} for i in (self.FIRST, self.SECOND)], f)
            kills_file = os.path.join(d, "kills.json")
            with open(kills_file, "w") as f:
                json.dump(kills_matrix, f)
            with mock.patch.object(kills, "index_reach", index_reach):
                result = kills.evaluate(d, kills_file, [self.FIRST], 1, [])
        self.assertEqual(asked, [self.FIRST, self.SECOND])
        return result

    def test_a_title_reaches_what_either_of_its_tests_reached(self):
        result = self.evaluate("passed")
        self.assertEqual(result["ordinals"], {self.FIRST: [self.FIRST, self.SECOND]})
        self.assertEqual(result["mutants"]["negate"]["candidates_reaching"], 1)
        row = result["candidates"][self.FIRST]
        self.assertEqual((row["state"], row["qualifying_mutants"], row["qualifying_basis"]),
                         ("passed", {"logic": 1}, {"subtraction": ["negate"]}))
        self.assertIn("1 candidates each stand for several index tests that share their title", kills.report(result))

    def test_a_title_whose_second_test_failed_is_unmeasured(self):
        row = self.evaluate("failed")["candidates"][self.FIRST]
        self.assertEqual((row["state"], row["verdict"], row["reason"]),
                         ("failed", "unmeasured", "failed in the capture run, so its reached code is incomplete"))


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
                survivors = (row.get("eligibility") or {}).get("survivors") or []
                self.assertEqual([mid for mid in survivors if stays_killed(mid)], [])


PR_BASE, PR_HEAD = "2f3fe9904e4addbcbe4d32403d6a7ab2fc471100", "7960eb8ff6cf91d143ccc97d3c992e5ba2a7d60f"
PR_SPEC = "e2e/test/scenarios/documents/documents.cy.spec.ts::documents "
D1, D2, D3, D4, D5, D6, D7 = (f"{PR_SPEC}removed test {n}" for n in range(1, 8))
H1, H2, H3 = (f"{PR_SPEC}kept test {n}" for n in range(1, 4))
J1, J2 = (f"frontend/src/metabase/documents/Document.unit.spec.tsx::Document {what}" for what in ("renders", "saves"))
PR_FILE = "frontend/src/metabase/documents/components/DocumentPage.tsx"
PR_ROLES = {"e2e_base": "removed", "e2e_head": "remaining", "jest_head": "remaining", "jest_base": "reference"}


def layer_result(killed_by=(), ran=(), errored=(), unconfirmed_by=(), scope=None, selected=None, excluded=(), base=None):
    result = {"killed_by": list(killed_by), "ran": list(ran), "errored": list(errored)}
    if unconfirmed_by:
        result["unconfirmed_by"] = list(unconfirmed_by)
    if base:
        result["base"] = base
    if scope:
        result["scope"] = scope
    if selected is not None:
        result["selected"] = list(selected)
    if excluded:
        result["excluded"] = [{"test": t, "reason": why} for t, why in excluded]
    return result


def head_result(*args, **kwargs):
    return layer_result(*args, base=PR_HEAD, **kwargs)


def pr_mutant(stratum, **layer_results):
    return {"stratum": stratum, "origin": "synthetic", "file": PR_FILE, "layer_results": layer_results}


def format_2(mutants, roles=PR_ROLES, **meta):
    return {"meta": {"format": 2, "base": PR_BASE, **({"layer_roles": roles} if roles else {}), **meta},
            "mutants": copy.deepcopy(mutants)}


PR_KILLS = {
    "selected-miss": pr_mutant(
        "logic", e2e_base=layer_result([D1], [D1, D2]),
        e2e_head=head_result(ran=[H1, H2, D1], scope="selected", selected=[H1, H2], excluded=[(H3, "reaches no document page")]),
        jest_head=head_result(ran=[J1], scope="selected", selected=[J1])),
    "error-only": pr_mutant("logic", e2e_base=layer_result([D2], [D2]),
                            e2e_head=head_result(ran=[H1], errored=[H1], scope="selected", selected=[H1])),
    "unconfirmed": pr_mutant("intra-frontend-wiring", e2e_base=layer_result([D2], [D2]),
                             e2e_head=head_result(ran=[H2], unconfirmed_by=[H2], scope="selected", selected=[H2])),
    "unrun": pr_mutant("intra-frontend-wiring", e2e_base=layer_result([D3], [D3]),
                       e2e_head=head_result(scope="selected", selected=[H1, H2])),
    "partial-run": pr_mutant("logic", e2e_base=layer_result([D3], [D3]),
                             e2e_head=head_result(ran=[H1, H2], errored=[H2], scope="selected", selected=[H1, H2, H3])),
    "excluded": pr_mutant("boundary-wiring", e2e_base=layer_result([D3], [D3]),
                          e2e_head=head_result(scope="selected", selected=[],
                                               excluded=[("*", "no e2e test at the head prints a document")])),
    "head-unmeasured": pr_mutant("logic", e2e_base=layer_result([D1], [D1])),
    "jest-kill": pr_mutant("logic", e2e_base=layer_result([D1], [D1]), jest_head=head_result([J1], [J1, J2]),
                           jest_base=layer_result([], [J1])),
    "reference-kill": pr_mutant("store-state", e2e_base=layer_result([D4], [D4]), jest_base=layer_result([J2], [J2])),
    "kept-in-base": pr_mutant("logic", e2e_base=layer_result([H1], [D4, H1]), e2e_head=head_result(ran=[H1])),
}
PR_CANDIDATES = [D1, D2, D3, D4]
PR_REMAINING = {
    "selected-miss": ("missed", "selected", "missed by 3 selected remaining tests, 1 excluded",
                      ["caught by a removed test", "missed by the selected remaining tests"]),
    "error-only": ("unresolved", "selected", "no result from the selected remaining tests, 1 errored", ["caught by a removed test"]),
    "unconfirmed": ("unresolved", "selected", "no result from the selected remaining tests, 1 unconfirmed", ["caught by a removed test"]),
    "unrun": ("unmeasured at the head", "selected", "not run by any remaining test, 2 selected but not run",
              ["caught by a removed test", "unmeasured at the head"]),
    "partial-run": ("missed", "selected", "missed by 1 selected remaining tests, 1 errored, 1 selected but not run",
                    ["caught by a removed test", "missed by the selected remaining tests"]),
    "excluded": ("statically excluded", "selected", "statically excluded: no e2e test at the head prints a document",
                 ["caught by a removed test", "statically excluded"]),
    "head-unmeasured": ("unmeasured at the head", None, "not run by any remaining test", ["caught by a removed test", "unmeasured at the head"]),
    "jest-kill": ("killed", "full", "killed by 1 remaining tests", ["caught by a removed test"]),
    "reference-kill": ("unmeasured at the head", None, "not run by any remaining test", ["caught by a removed test", "unmeasured at the head"]),
    "kept-in-base": ("missed", "full", "missed by 1 remaining tests", ["missed by the selected remaining tests"]),
}


def write_candidates_file(d, tests, removed_at=PR_BASE, head=PR_HEAD):
    path = os.path.join(d, "candidates.json")
    with open(path, "w") as f:
        json.dump({"removed_at": removed_at, **({"head": head} if head else {}), "tests": tests}, f)
    return path


def evaluate_pr(entries, candidate_ids, min_mutants=kills.MIN_MUTANTS, strata=STRATA, **options):
    """kills.py's result for a kills file of these entries and a candidates file of these tests, with no index."""
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "kills.json")
        with open(path, "w") as f:
            json.dump(entries, f)
        candidates = kills.read_candidates_file(write_candidates_file(d, candidate_ids))
        return kills.evaluate_candidates_file(path, candidates, min_mutants, list(strata), **options)


class PullRequestKills(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = evaluate_pr(format_2(PR_KILLS), PR_CANDIDATES)
        cls.rows = cls.result["candidates"]
        cls.mutants = cls.result["mutants"]

    def test_each_mutant_has_a_remaining_result_a_scope_and_its_states(self):
        for mid, (result, scope, text, states) in PR_REMAINING.items():
            with self.subTest(mid):
                m = self.mutants[mid]
                self.assertEqual((m["remaining"]["result"], m["remaining"]["scope"], m["remaining"]["text"], m["states"]),
                                 (result, scope, text, states))

    def test_errored_unconfirmed_unrun_and_excluded_results_are_never_misses(self):
        for mid in ("error-only", "unconfirmed", "unrun", "excluded"):
            with self.subTest(mid):
                side = self.mutants[mid]["remaining"]
                self.assertEqual((side["missed"], side["missed_by"]), (0, []))
        self.assertEqual({k: self.mutants["error-only"]["remaining"][k] for k in ("errored", "unconfirmed_by", "not_run")},
                         {"errored": [H1], "unconfirmed_by": [], "not_run": []})
        self.assertEqual(self.mutants["unconfirmed"]["remaining"]["unconfirmed_by"], [H2])
        self.assertEqual(self.mutants["unrun"]["remaining"]["not_run"], [H1, H2])
        self.assertEqual(self.mutants["excluded"]["remaining"]["excluded"],
                         [{"test": "*", "reason": "no e2e test at the head prints a document", "layer": "e2e_head"}])

    def test_a_mixed_run_keeps_its_unresolved_tests(self):
        side = self.mutants["partial-run"]["remaining"]
        self.assertEqual({k: side[k] for k in ("missed", "missed_by", "errored", "not_run")},
                         {"missed": 1, "missed_by": [H1], "errored": [H2], "not_run": [H3]})
        self.assertEqual(side["layers"]["e2e_head"],
                         {"role": "remaining", "scope": "selected", "selected": 3, "missed": 1, "errored": 1, "not run": 1, "excluded": 0})

    def test_a_keep_names_the_scope_its_unique_kills_rest_on(self):
        expected = {
            D1: ("keep", "selected", "unique kills; head-unmeasured: not run by any remaining test; "
                                     "selected-miss: missed by 3 selected remaining tests, 1 excluded"),
            D2: ("keep", "unmeasured", "unique kills; error-only: no result from the selected remaining tests, 1 errored; "
                                       "unconfirmed: no result from the selected remaining tests, 1 unconfirmed"),
            D3: ("keep", "selected", "unique kills; excluded: statically excluded: no e2e test at the head prints a document; "
                                     "partial-run: missed by 1 selected remaining tests, 1 errored, 1 selected but not run; "
                                     "unrun: not run by any remaining test, 2 selected but not run"),
            D4: ("keep", "unmeasured", "unique kills; reference-kill: not run by any remaining test"),
        }
        self.assertEqual({c: (r["verdict"], r["scope"], r["reason"]) for c, r in self.rows.items()}, expected)
        self.assertEqual(self.rows[D1]["unique_kills"], {"logic": ["head-unmeasured", "selected-miss"]})
        self.assertEqual(self.result["summary"]["scopes"], {"keep": {"selected": 2, "unmeasured": 2}})
        self.assertEqual(self.result["summary"]["reasons"], {"keep: unique kills": 4})

    def test_a_kept_test_counts_only_through_its_head_result_and_a_reference_layer_not_at_all(self):
        self.assertEqual((self.mutants["kept-in-base"]["removed"], self.mutants["kept-in-base"]["remaining"]["killed_by"]),
                         ({"result": "missed", "tests": {D4: "missed"}}, []))
        self.assertEqual(self.rows[D4]["unique_kills"], {"store-state": ["reference-kill"]})
        self.assertEqual(self.result["kills"]["results_on_the_other_side"],
                         {"candidates in a remaining layer": 1, "other tests in a removed layer": 1})
        self.assertEqual(self.mutants["selected-miss"]["removed"], {"result": "caught", "tests": {D1: "killed", D2: "missed"}})

    def test_mutant_states_are_counted(self):
        self.assertEqual(self.result["mutant_states"]["states"], {
            "caught by a removed test": 9, "missed by the selected remaining tests": 3, "statically excluded": 1,
            "unmeasured at the head": 3,
        })
        self.assertEqual(self.result["mutant_states"]["caught by a removed test and killed by no remaining test"], 8)

    def test_the_command_reads_a_candidates_file_without_an_index(self):
        with tempfile.TemporaryDirectory() as d:
            path, out = os.path.join(d, "kills.json"), os.path.join(d, "verdicts.json")
            with open(path, "w") as f:
                json.dump(format_2(PR_KILLS), f)
            candidates = write_candidates_file(d, PR_CANDIDATES)
            env = {k: v for k, v in os.environ.items() if k != "JOURNEY_LOOKUP_INDEX"}
            done = subprocess.run([sys.executable, kills.__file__, "--kills", path, "--candidates", candidates, "--out", out],
                                  stdout=subprocess.PIPE, text=True, env=env, check=True)
            with open(out) as f:
                written = json.load(f)
            both = subprocess.run([sys.executable, kills.__file__, "--kills", path, "--candidates", candidates, "--candidates", D1],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
        self.assertEqual((written["mode"], written["index"]), ("candidates file", None))
        self.assertEqual(written["candidates_file"], {"file": candidates, "removed_at": PR_BASE, "head": PR_HEAD})
        self.assertEqual(written["candidates"], json.loads(json.dumps(self.rows)))
        lines = done.stdout.splitlines()
        self.assertEqual(lines[0], "Joint check: ok")
        self.assertIn(f"for the candidates in {candidates}, removed at {PR_BASE[:11]} and head {PR_HEAD[:11]}, "
                      "with no index, so a candidate reaches every mutant it ran", lines[1])
        self.assertTrue(lines[2].startswith(f"Provenance match, against the removed-at revision {PR_BASE[:11]} and the head "
                                            f"revision {PR_HEAD[:11]}: 21 layer results match, kills file sha256 "), lines[2])
        self.assertEqual(lines[3], "Kills file format 2, layer roles: e2e_base removed, e2e_head remaining, jest_base reference, "
                                   "jest_head remaining")
        self.assertIn(f"\n  {D1}\n      unique kills: logic 2\n      scope selected: head-unmeasured: not run by any remaining test; ",
                      done.stdout)
        self.assertIn("\nCaught by a removed test and killed by no remaining test\n  logic error-only: no result from the selected "
                      f"remaining tests, 1 errored\n      {D2}\n  boundary-wiring excluded: statically excluded: ", done.stdout)
        self.assertIn("\n  10 with reach taken from `ran`, since a candidates file reads no index\n4 candidates\n", done.stdout)
        self.assertNotEqual(both.returncode, 0)
        self.assertIn("a candidates file with `removed_at` must be the only --candidates", both.stderr)

    def test_layer_roles_must_name_every_tested_layer_with_a_known_role(self):
        cases = {
            "unnamed": (format_2(PR_KILLS, roles={k: v for k, v in PR_ROLES.items() if k != "jest_base"}),
                        "meta.layer_roles gives no role to the layers jest_base"),
            "unknown": (format_2(PR_KILLS, roles=PR_ROLES | {"jest_base": "baseline"}),
                        "meta.layer_roles gives roles other than removed, remaining, reference: jest_base 'baseline'"),
            "format": ({"meta": {"format": 3}, "mutants": {}}, "has a `meta` with format 3"),
        }
        for name, (entries, message) in cases.items():
            with self.subTest(name):
                with self.assertRaisesRegex(ValueError, re.escape(message)):
                    evaluate_pr(entries, PR_CANDIDATES)
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "no-removed-at.json")
            with open(path, "w") as f:
                json.dump({"tests": [D1]}, f)
            with self.assertRaisesRegex(ValueError, "has no `removed_at`"):
                kills.read_candidates_file(path)


def shared_kills(n, stratum="logic", candidate=D5, killer=J1, **extra):
    """n mutants the candidate runs and a remaining jest test kills at the head."""
    return {f"{stratum}-{i}": pr_mutant(stratum, e2e_base=layer_result([], [candidate]),
                                        jest_head=head_result([killer], [killer]), **extra) for i in range(1, n + 1)}


def killed_by_candidate_too(entries, mid, candidate=D5):
    return entries | {mid: entries[mid] | {"layer_results": entries[mid]["layer_results"] | {
        "e2e_base": layer_result([candidate], [candidate])}}}


class DeleteGates(unittest.TestCase):
    def verdict(self, entries, candidates=(D5,), **options):
        row = evaluate_pr(format_2(entries), list(candidates), **options)["candidates"][candidates[0]]
        return row["verdict"], row["reason"]

    def test_insufficient_sampling_never_earns_a_delete(self):
        enough = killed_by_candidate_too(shared_kills(3) | shared_kills(2, "intra-frontend-wiring"), "logic-1")
        self.assertEqual(self.verdict(enough), ("delete", "no unique kill"))
        cases = {
            "four mutants": ((killed_by_candidate_too(shared_kills(3) | shared_kills(1, "intra-frontend-wiring"), "logic-1")),
                             "4 qualifying mutants, fewer than 5"),
            "no wiring mutant": (killed_by_candidate_too(shared_kills(5), "logic-1"), "no qualifying wiring mutant"),
            "errored on two": (enough | {mid: pr_mutant("logic", e2e_base=layer_result([], [D5], errored=[D5]),
                                                        jest_head=head_result([J1], [J1])) for mid in ("logic-2", "logic-3")},
                               "3 qualifying mutants, fewer than 5"),
            "no other test ran two": (enough | {mid: pr_mutant("logic", e2e_base=layer_result([], [D5])) for mid in ("logic-2", "logic-3")},
                                      "3 qualifying mutants, fewer than 5"),
            "a kill on none of them and no baseline run": (shared_kills(3) | shared_kills(2, "intra-frontend-wiring"),
                                                           "needs a baseline check"),
        }
        for name, (entries, reason) in cases.items():
            with self.subTest(name):
                self.assertEqual(self.verdict(entries), ("unmeasured", reason))

    def test_confirmed_killers_justify_a_keep_and_unconfirmed_ones_only_a_provisional_keep(self):
        base = killed_by_candidate_too(shared_kills(3) | shared_kills(2, "intra-frontend-wiring"), "logic-1")
        unique = base | {"own": pr_mutant("logic", e2e_base=layer_result([D5], [D5]), jest_head=head_result([], [J1]))}
        unconfirmed = base | {"own": pr_mutant("logic", e2e_base=layer_result([], [D5], unconfirmed_by=[D5]),
                                               jest_head=head_result([], [J1]))}
        remaining_confirmed = base | {"own": pr_mutant("logic", e2e_base=layer_result([D5], [D5]), jest_head=head_result([J1], [J1]))}
        remaining_unconfirmed = base | {"own": pr_mutant("logic", e2e_base=layer_result([D5], [D5]),
                                                         jest_head=head_result([], [J1], unconfirmed_by=[J1]))}
        self.assertEqual(self.verdict(unique), ("keep", "unique kills"))
        self.assertEqual(self.verdict(unconfirmed), ("provisional-keep", "unconfirmed unique kills"))
        self.assertEqual(self.verdict(remaining_confirmed), ("delete", "no unique kill"))
        self.assertEqual(self.verdict(remaining_unconfirmed),
                         ("keep", "unique kills; own: no result from the remaining tests, 1 unconfirmed"))


SUSPECT_PRIOR = {"files": {PR_FILE: {"module": "fe:documents", "score": 0.1}}}


def suspect_kills(**marks):
    entries = killed_by_candidate_too(shared_kills(3) | shared_kills(1, "intra-frontend-wiring"), "logic-1")
    return entries | {"suspect": pr_mutant("intra-frontend-wiring", e2e_base=layer_result([], [D5]),
                                           jest_head=head_result([], [J1])) | {"equivalent_suspect": True} | marks}


REVIEWED = {"equivalence": {"reviewed_by": "fraser", "date": "2026-09-29", "reason": "drops a cleanup after the promise settles"}}
SCOPED = {"scope_decision": {"by": "fraser", "date": "2026-09-29", "reason": "print timing is out of this PR's scope"}}


class EquivalenceSuspects(unittest.TestCase):
    @staticmethod
    def evaluate(entries, **options):
        with tempfile.TemporaryDirectory() as d:
            prior = os.path.join(d, "prior.json")
            with open(prior, "w") as f:
                json.dump(SUSPECT_PRIOR, f)
            return evaluate_pr(format_2(entries), [D5], prior_path=prior, **options)

    def test_an_unresolved_suspect_earns_no_credit_blocks_eligibility_and_is_flagged(self):
        result = self.evaluate(suspect_kills())
        row = result["candidates"][D5]
        self.assertEqual((row["verdict"], row["reason"], row["equivalent_suspects"]),
                         ("unmeasured", "4 qualifying mutants, fewer than 5", {"suspect": "unresolved"}))
        self.assertEqual((row["eligibility"]["sampled"], row["eligibility"]["survivors"], row["eligibility"]["outcome"]),
                         (4, ["suspect"], "unresolved suspected equivalent mutant in sample"))
        self.assertEqual(result["mutants"]["suspect"]["equivalent_suspect"],
                         {"state": "unresolved", "deletion_depends_on_dismissing": True, "candidates": [D5]})
        self.assertEqual(result["kills"]["equivalent_suspects"],
                         {"unresolved": 1, "reviewed equivalence": 0, "scope decision": 0, "killed": 0})
        self.assertIn(f"  suspect: unresolved, no sample credit and a blocker, a deletion depends on dismissing it: {D5}",
                      kills.report(result))

    def test_a_suspect_among_mutants_that_already_justify_a_delete_does_not_veto_it(self):
        entries = suspect_kills() | killed_by_candidate_too(shared_kills(1, "intra-frontend-wiring", killer=J2), "intra-frontend-wiring-1")
        entries |= {"logic-4": shared_kills(1)["logic-1"]}
        row = self.evaluate(entries)["candidates"][D5]
        self.assertEqual((row["verdict"], row["equivalent_suspects"]), ("delete", {"suspect": "unresolved"}))

    def test_two_suspects_blocking_one_candidate_are_neither_flagged(self):
        entries = suspect_kills() | {"suspect-2": suspect_kills()["suspect"]}
        result = self.evaluate(entries)
        self.assertEqual({mid: result["mutants"][mid]["equivalent_suspect"]["deletion_depends_on_dismissing"]
                          for mid in ("suspect", "suspect-2")}, {"suspect": False, "suspect-2": False})

    def test_a_reviewed_equivalence_or_a_scope_decision_leaves_the_blocker_count(self):
        for name, marks, state in (("reviewed", REVIEWED, "reviewed equivalence"), ("scoped", SCOPED, "scope decision")):
            with self.subTest(name):
                result = self.evaluate(suspect_kills(**marks))
                row = result["candidates"][D5]
                self.assertEqual((row["verdict"], row["equivalent_suspects"], row["eligibility"]["sampled"]),
                                 (ELIGIBLE, {"suspect": state}, 4))
                self.assertEqual(row["eligibility"]["survivors"], [])
                self.assertEqual(result["mutants"]["suspect"]["equivalent_suspect"],
                                 {"state": state, **marks, "deletion_depends_on_dismissing": False, "candidates": []})

    def test_a_record_missing_a_field_leaves_the_suspect_unresolved(self):
        incomplete = {"equivalence": {"reviewed_by": "fraser", "date": "2026-09-29"}}
        result = self.evaluate(suspect_kills(**incomplete))
        self.assertEqual(result["mutants"]["suspect"]["equivalent_suspect"]["state"], "unresolved")
        self.assertEqual(result["kills"]["incomplete_equivalence_records"], {"suspect": ["`equivalence` has no reason"]})
        self.assertIn("  suspect: `equivalence` has no reason, so the record is ignored", kills.report(result))

    def test_a_suspect_a_test_kills_counts_as_killed(self):
        entries = suspect_kills()
        entries["suspect"]["layer_results"]["jest_head"] = head_result([J1], [J1])
        result = self.evaluate(entries)
        row = result["candidates"][D5]
        self.assertEqual((row["verdict"], row["equivalent_suspects"], row["qualifying_mutants"]),
                         ("delete", {}, {"logic": 3, "intra-frontend-wiring": 2}))
        self.assertEqual(result["mutants"]["suspect"]["equivalent_suspect"],
                         {"state": "killed", "deletion_depends_on_dismissing": False, "candidates": []})


def index_meta():
    with open(os.path.join(INDEX, "meta.json")) as f:
        return json.load(f)


LEDGER_SCOPE_KILLS = format_2({
    "errored-remaining": mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE, errored=[REMAINING]),
    "unconfirmed-remaining": mutant("intra-frontend-wiring", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE, unconfirmed_by=[REMAINING]),
    "selected": mutant("logic", [PAIRED], [PAIRED, REMAINING], L_PAIRED) | {"layer_results": {"e2e": {
        "scope": "selected", "selected": [PAIRED, REMAINING, BOOKMARK_MODEL],
        "excluded": [{"test": BOOKMARK_COLLECTION, "reason": "reaches no collection page"}]}}},
    "suspect-unresolved": suspect(mutant("logic", [], [UNIT, REMAINING], L_UNIT)),
    "suspect-reviewed": suspect(mutant("logic", [], [UNIT, REMAINING], L_UNIT)) | REVIEWED,
    "suspect-scoped": suspect(mutant("logic", [], [UNIT, REMAINING], L_UNIT)) | SCOPED,
    "suspect-incomplete": suspect(mutant("logic", [], [UNIT, REMAINING], L_UNIT)) | {"scope_decision": {"by": "fraser"}},
    "suspect-killed": suspect(mutant("logic", [JEST], [UNIT, JEST], L_UNIT)),
}, roles=None)


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class LedgerScopeAndSuspects(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        meta = index_meta()
        on_the_index = LEDGER_SCOPE_KILLS | {"meta": LEDGER_SCOPE_KILLS["meta"] | {"base": meta["appBase"]}}
        cls.joined = ledger_run(on_the_index, [UNIQUE, PAIRED, UNIT], 1, [])

    def test_the_ledger_gives_the_same_scopes_reasons_and_suspect_credit(self):
        self.assertEqual(self.joined.check.returncode, 0, self.joined.check.stdout)
        rows = self.joined.result["candidates"]
        self.assertEqual({c: (rows[c]["verdict"], rows[c]["scope"], rows[c]["reason"]) for c in (UNIQUE, PAIRED)}, {
            UNIQUE: ("keep", "unmeasured", "unique kills; errored-remaining: no result from the remaining tests, 1 errored; "
                                           "unconfirmed-remaining: no result from the remaining tests, 1 unconfirmed"),
            PAIRED: ("keep", "selected", "unique kills; selected: missed by 1 selected remaining tests, 1 selected but not run, "
                                         "1 excluded"),
        })
        self.assertEqual(rows[UNIT]["equivalent_suspects"], {
            "suspect-incomplete": "unresolved", "suspect-reviewed": "reviewed equivalence", "suspect-scoped": "scope decision",
            "suspect-unresolved": "unresolved"})
        self.assertEqual(rows[UNIT]["qualifying_basis"], {"subtraction": ["suspect-killed"]})

    def test_the_ledger_shows_how_each_suspect_stands(self):
        states = {mid: m.get("equivalence_state") for mid, m in self.joined.ledger["mutants"].items() if m.get("equivalent_suspect")}
        self.assertEqual(states, {"suspect-unresolved": "unresolved", "suspect-reviewed": "reviewed equivalence",
                                  "suspect-scoped": "scope decision", "suspect-incomplete": "unresolved", "suspect-killed": "killed"})
        self.assertIn("Among the ones with no confirmed kill, 2 are unresolved (suspect-incomplete, suspect-unresolved): they get no "
                      "sample credit in the verdicts, and they block eligibility until a reviewed equivalence or a scope decision is "
                      "recorded on them. 1 by reviewed equivalence (suspect-reviewed), 1 by scope decision (suspect-scoped) are "
                      "resolved, with no sample credit and no longer blockers. Records missing a field, so ignored: "
                      "suspect-incomplete: `scope_decision` has no date, reason.", self.joined.summary)
        self.assertEqual({r["mutant"]: r["equivalence_state"] for r in self.joined.csv if r["mutant"].startswith("suspect-")}, {
            "suspect-unresolved": "unresolved", "suspect-reviewed": "reviewed equivalence", "suspect-scoped": "scope decision",
            "suspect-incomplete": "unresolved", "suspect-killed": "killed"})

    def test_misses_leave_out_unconfirmed_results(self):
        self.assertEqual(self.joined.ledger["mutants"]["unconfirmed-remaining"]["misses"], 0)
        self.assertEqual(self.joined.ledger["mutants"]["selected"]["misses"], 1)


def sampled_kills(candidate):
    """Four mutants the candidate runs and a remaining jest test kills, one of which the candidate kills too."""
    entries = shared_kills(3, candidate=candidate) | shared_kills(1, "intra-frontend-wiring", candidate=candidate)
    return {f"{candidate[-1]}-{mid}": e for mid, e in killed_by_candidate_too(entries, "logic-1", candidate).items()}


AUTHORISED = {"authorisation": {"by": "fraser", "date": "2026-09-29"}, "policy_scope": "repro tests in quiet document modules"}


class RiskAcceptance(unittest.TestCase):
    def evaluate(self, entries, candidates, acceptances=None, cap=kills.ACCEPT_CAP, command=False):
        with tempfile.TemporaryDirectory() as d:
            prior = write_kills(d, SUSPECT_PRIOR, "prior.json")
            accepted = write_kills(d, acceptances, "acceptances.json") if acceptances is not None else None
            if command:
                out = os.path.join(d, "verdicts.json")
                done = subprocess.run(
                    [sys.executable, kills.__file__, "--kills", write_kills(d, format_2(entries)), "--candidates",
                     write_candidates_file(d, candidates), "--prior", prior, "--acceptances", accepted, "--out", out],
                    stdout=subprocess.PIPE, text=True, check=True)
                with open(out) as f:
                    return json.load(f), done.stdout
            path = write_kills(d, format_2(entries))
            cf = kills.read_candidates_file(write_candidates_file(d, candidates))
            return kills.evaluate_candidates_file(path, cf, prior_path=prior, cap=cap, acceptances_path=accepted)

    def test_an_eligible_candidate_needs_a_recorded_acceptance_to_be_accepted(self):
        for name, acceptances in (("no acceptances file", None), ("not named in it", {D6: AUTHORISED})):
            with self.subTest(name):
                result = self.evaluate(sampled_kills(D5), [D5], acceptances)
                row = result["candidates"][D5]
                self.assertEqual((row["verdict"], row["eligibility"]["outcome"], "accepted" in row), (ELIGIBLE, "eligible", False))
                self.assertEqual((set(result["risk_acceptance"]["eligible"]), result["risk_acceptance"]["accepted"]), ({D5}, {}))

    def test_an_acceptance_with_both_fields_makes_it_accepted(self):
        result, text = self.evaluate(sampled_kills(D5), [D5], {D5: AUTHORISED}, command=True)
        row = result["candidates"][D5]
        self.assertEqual((row["verdict"], row["eligibility"]["outcome"], row["accepted"]), ("accepted", "eligible", AUTHORISED))
        self.assertEqual(result["risk_acceptance"]["accepted"], {D5: AUTHORISED})
        self.assertEqual(result["summary"]["verdicts"][ELIGIBLE], 0)
        self.assertEqual(result["summary"]["verdicts"]["accepted"], 1)
        self.assertIn(f"\n  {D5}\n      module fe:documents, prior 0.1, 4 mutants sampled, bound 0.75\n"
                      "      accepted by fraser on 2026-09-29, under repro tests in quiet document modules\n", text)

    def test_a_record_missing_a_field_leaves_it_eligible_with_a_warning(self):
        cases = {
            "no date": ({"authorisation": {"by": "fraser"}, "policy_scope": "quiet modules"}, "authorisation.date"),
            "no policy scope": ({"authorisation": AUTHORISED["authorisation"]}, "policy_scope"),
            "no authorisation": ({"policy_scope": "quiet modules"}, "authorisation.by, authorisation.date"),
        }
        for name, (record, gaps) in cases.items():
            with self.subTest(name):
                result = self.evaluate(sampled_kills(D5), [D5], {D5: record, H1: AUTHORISED})
                self.assertEqual(result["candidates"][D5]["verdict"], ELIGIBLE)
                self.assertEqual(result["risk_acceptance"]["data_warnings"], [
                    f"{H1}: an acceptance is recorded for a test that isn't a candidate",
                    f"{D5}: the acceptance has no {gaps}, so it stays eligible for risk acceptance",
                ])

    def test_the_module_cap_holds_whatever_is_accepted(self):
        result = self.evaluate(sampled_kills(D5) | sampled_kills(D6), [D5, D6], {D5: AUTHORISED, D6: AUTHORISED}, cap=1)
        rows = result["candidates"]
        self.assertEqual({c: (rows[c]["verdict"], rows[c]["eligibility"]["outcome"]) for c in (D5, D6)},
                         {D5: ("accepted", "eligible"), D6: ("unmeasured", "over the module cap")})
        self.assertEqual(result["risk_acceptance"]["modules"], {"fe:documents": {"eligible": [D5], "over_cap": [D6], "prior": None}})
        self.assertEqual(result["risk_acceptance"]["data_warnings"], [
            f"{D6}: an acceptance is recorded, and the verdict is unmeasured, not eligible for risk acceptance, so it stands"])
        both = self.evaluate(sampled_kills(D5) | sampled_kills(D6), [D5, D6], {D5: AUTHORISED}, cap=2)["candidates"]
        self.assertEqual({c: both[c]["verdict"] for c in (D5, D6)}, {D5: "accepted", D6: ELIGIBLE})


OTHER_BASE = "0123456789abcdef0123456789abcdef01234567"


def write_kills(d, entries, name="kills.json"):
    path = os.path.join(d, name)
    with open(path, "w") as f:
        json.dump(entries, f)
    return path


class CandidatesFileProvenance(unittest.TestCase):
    def evaluate(self, entries, removed_at=PR_BASE, head=PR_HEAD, allow=False):
        with tempfile.TemporaryDirectory() as d:
            candidates = kills.read_candidates_file(write_candidates_file(d, PR_CANDIDATES, removed_at, head))
            return kills.evaluate_candidates_file(write_kills(d, entries), candidates, allow_provenance_mismatch=allow)

    def command(self, entries, *options, removed_at=PR_BASE):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "verdicts.json")
            done = subprocess.run(
                [sys.executable, kills.__file__, "--kills", write_kills(d, entries), "--candidates",
                 write_candidates_file(d, PR_CANDIDATES, removed_at), "--out", out, *options],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            written = None
            if os.path.isfile(out):
                with open(out) as f:
                    written = json.load(f)
        return done, written

    def test_bases_that_differ_by_layer_match_the_removed_at_and_head_revisions(self):
        p = self.evaluate(format_2(PR_KILLS))["provenance"]
        self.assertEqual((p["status"], p["banner"], p["mismatches"], p["unknown"]), ("match", None, [], []))
        self.assertEqual({(c["layer"], c["found"], tuple(c["expected"]), c["result"]) for c in p["checks"]}, {
            ("e2e_base", PR_BASE, (PR_BASE,), "match"), ("jest_base", PR_BASE, (PR_BASE,), "match"),
            ("e2e_head", PR_HEAD, (PR_HEAD,), "match"), ("jest_head", PR_HEAD, (PR_HEAD,), "match"),
        })
        self.assertEqual(p["against"], {"removed_at": PR_BASE, "head": PR_HEAD})
        self.assertEqual(p["mutants_without_patch_sha256"], len(PR_KILLS))

    def test_a_mismatch_is_refused(self):
        with self.assertRaisesRegex(kills.ProvenanceMismatch, re.escape(
                f"the production revision of e2e_base is {PR_BASE[:11]} on 10 mutants, where {OTHER_BASE[:11]} was expected")):
            self.evaluate(format_2(PR_KILLS), removed_at=OTHER_BASE)
        done, written = self.command(format_2(PR_KILLS), removed_at=OTHER_BASE)
        self.assertEqual((done.returncode, written), (2, None))
        self.assertTrue(done.stderr.startswith("Refusing to give verdicts: the production revision of e2e_base is "), done.stderr)
        self.assertIn("Pass --allow-provenance-mismatch to give verdicts anyway, with every output stamped.", done.stderr)

    def test_an_override_stamps_the_json_and_the_first_line(self):
        done, written = self.command(format_2(PR_KILLS), "--allow-provenance-mismatch", removed_at=OTHER_BASE)
        self.assertEqual(done.returncode, 0, done.stderr)
        p = written["provenance"]
        self.assertEqual((p["status"], p["overridden"]), ("mismatch", True))
        banner = ("Provenance mismatch, overridden by --allow-provenance-mismatch: the production revision of e2e_base is "
                  f"{PR_BASE[:11]} on 10 mutants, where {OTHER_BASE[:11]} was expected; the production revision of jest_base is "
                  f"{PR_BASE[:11]} on 2 mutants, where {OTHER_BASE[:11]} was expected")
        self.assertEqual((p["banner"], done.stdout.splitlines()[0]), (banner, banner))
        self.assertEqual(done.stdout.splitlines()[1], "Joint check: ok")

    def test_one_layer_off_its_revision_within_a_mutant_is_a_mismatch(self):
        entries = format_2(PR_KILLS)
        entries["mutants"]["jest-kill"]["layer_results"]["jest_head"]["base"] = OTHER_BASE
        with self.assertRaisesRegex(kills.ProvenanceMismatch, re.escape(
                f"the production revision of jest_head is {OTHER_BASE[:11]} on 1 mutants, where {PR_HEAD[:11]} was expected")):
            self.evaluate(entries)

    def test_head_layers_go_unchecked_when_the_candidates_file_names_no_head(self):
        result = self.evaluate(format_2(PR_KILLS), head=None)
        p = result["provenance"]
        self.assertEqual(p["status"], "match")
        self.assertEqual({c["result"] for c in p["checks"] if c["layer"].endswith("_head")}, {"not checked"})
        self.assertIn(f"against the removed-at revision {PR_BASE[:11]}, with no head revision to check against: 12 layer results match",
                      kills.report(result))

    def test_the_flat_format_reads_as_base_unknown(self):
        flat = {mid: {k: v for k, v in e.items() if k != "layer_results"} | {"killed_by": [D1], "ran": [D1]}
                for mid, e in PR_KILLS.items()}
        result = self.evaluate(flat)
        p = result["provenance"]
        self.assertEqual((p["status"], p["kills"]["format"], p["banner"]), ("unknown", "flat", FLAT_BANNER))
        self.assertTrue(kills.report(result).startswith(f"{FLAT_BANNER}\nJoint check: ok\n"))

    def test_each_mutant_carries_its_patch_digest_and_the_revisions_of_its_layers(self):
        entries = format_2(PR_KILLS)
        entries["mutants"]["selected-miss"] |= {"patch_sha256": "ab" * 32}
        entries["mutants"]["selected-miss"]["layer_results"]["e2e_head"] |= {
            "tests_rev": PR_HEAD, "runner": {"workflow": "e2e-kills.yml", "lockfile_sha256": "cd" * 32}}
        result = self.evaluate(entries)
        m = result["mutants"]["selected-miss"]
        self.assertEqual((m["patch_sha256"], m["provenance"]["e2e_head"]), (
            "ab" * 32, {"base": PR_HEAD, "tests_rev": PR_HEAD, "runner": {"workflow": "e2e-kills.yml", "lockfile_sha256": "cd" * 32}}))
        self.assertEqual(m["provenance"]["e2e_base"], {"base": PR_BASE, "tests_rev": None, "runner": None})
        self.assertEqual(result["provenance"]["runners"], {"e2e_head": {"workflow": ["e2e-kills.yml"], "lockfile_sha256": ["cd" * 32]}})


INDEX_AGAINST = {"index_sha": "cc9a02ff3da204781106a4f28b204ca5ef6de2b3", "index_app_base": "8317274709c"}


class IndexProvenance(unittest.TestCase):
    @staticmethod
    def check(entries, against=INDEX_AGAINST, allow=False):
        with tempfile.TemporaryDirectory() as d:
            path = write_kills(d, entries)
            return kills.provenance(path, kills.read_kills_file(path), against, allow)

    def entries(self, e2e=None, jest=None, base="8317274709cdeadbeef"):
        e2e = {"base": None, "tests_rev": INDEX_AGAINST["index_sha"]} | (e2e or {})
        jest = {"base": None} | (jest or {})
        return format_2({"m": {"stratum": "logic", "layer_results": {
            "e2e": {k: v for k, v in e2e.items() if v}, "jest": {k: v for k, v in jest.items() if v}}}}, roles=None, base=base)

    def test_the_app_commit_or_the_captured_commit_match(self):
        for base in ("8317274709c", INDEX_AGAINST["index_sha"]):
            with self.subTest(base):
                self.assertEqual(self.check(self.entries(base=base))["status"], "match")

    def test_a_layer_whose_base_differs_from_the_others_is_a_mismatch(self):
        entries = self.entries(jest={"base": OTHER_BASE})
        with self.assertRaisesRegex(kills.ProvenanceMismatch, re.escape(
                f"the production revision of jest is {OTHER_BASE[:11]} on 1 mutants, where 8317274709c or cc9a02ff3da was expected")):
            self.check(entries)
        p = self.check(entries, allow=True)
        self.assertEqual((p["status"], p["overridden"], [c["result"] for c in p["checks"]]),
                         ("mismatch", True, ["match", "mismatch", "match"]))

    def test_an_e2e_layer_run_on_other_tests_than_the_capture_is_a_mismatch(self):
        with self.assertRaisesRegex(kills.ProvenanceMismatch, "the test revision of e2e is 0123456789a on 1 mutants"):
            self.check(self.entries(e2e={"tests_rev": OTHER_BASE}))

    def test_a_missing_revision_is_unknown(self):
        p = self.check(self.entries(e2e={"tests_rev": None}))
        self.assertEqual((p["status"], p["banner"]), ("unknown", "Provenance unknown: 1 mutants' e2e results record no tests_rev"))
        p = self.check(self.entries(), against={"index_sha": None, "index_app_base": None})
        self.assertEqual(p["status"], "unknown")


@unittest.skipUnless(INDEX, "needs JOURNEY_LOOKUP_INDEX")
class LedgerProvenance(unittest.TestCase):
    def ledger(self, entries, *options):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "ledger")
            done = subprocess.run(["node", os.path.join(HERE, "..", "lookup", "ledger.mjs"), "--index", INDEX, "--kills",
                                   write_kills(d, entries), "--candidates", UNIQUE, "--out", out, *options],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if done.returncode:
                return done, None, None, None
            with open(os.path.join(out, "ledger.json")) as f:
                ledger = json.load(f)
            with open(os.path.join(out, "ledger.csv")) as f:
                rows = list(csv.DictReader(f))
            with open(os.path.join(out, "summary.md")) as f:
                summary = f.read()
        return done, ledger, rows, summary

    def entries(self, base=None, tests_rev=None):
        meta = index_meta()
        entry = mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE) | {"layer_results": {"e2e": {
            "tests_rev": tests_rev or meta["sha"]}}}
        return format_2({"m": entry}, roles=None, base=base or meta["appBase"])

    def test_a_match_on_the_app_commit_marks_rows_in_files_the_capture_branch_changes(self):
        done, ledger, rows, summary = self.ledger(self.entries())
        self.assertEqual(done.returncode, 0, done.stderr)
        p = ledger["provenance"]
        self.assertEqual((p["status"], p["banner"], p["mixed_rows"]), ("match", None, 0))
        self.assertTrue(summary.startswith("# Location ledger\n\nProvenance: match. Kills base 8317274709c, index cc9a02ff3da "
                                           "(app commit 8317274709c), kills file sha256 "), summary[:300])
        self.assertEqual({r["base"] for r in rows}, {"match"})

    def test_a_mismatch_is_refused_and_an_override_stamps_every_output(self):
        done, *_ = self.ledger(self.entries(base=OTHER_BASE))
        self.assertEqual(done.returncode, 2)
        self.assertIn("Refusing to join: the production revision of e2e is 0123456789a on 1 mutants", done.stderr)
        done, ledger, rows, summary = self.ledger(self.entries(base=OTHER_BASE), "--allow-provenance-mismatch")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual((ledger["provenance"]["status"], ledger["provenance"]["overridden"]), ("mismatch", True))
        self.assertTrue(summary.startswith("Provenance mismatch, overridden by --allow-provenance-mismatch: the production revision "
                                           "of e2e is 0123456789a on 1 mutants"), summary[:200])
        self.assertEqual({r["base"] for r in rows}, {"mismatch"})

    def test_the_flat_format_reads_as_base_unknown(self):
        done, ledger, rows, summary = self.ledger({"m": mutant("logic", [UNIQUE], [UNIQUE, REMAINING], L_UNIQUE)})
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual((ledger["provenance"]["status"], ledger["provenance"]["banner"]), ("unknown", FLAT_BANNER))
        self.assertTrue(summary.startswith(f"{FLAT_BANNER}\n\n# Location ledger\n\nProvenance: unknown, the kills file is in the flat "
                                           "format, which records no revisions."), summary[:300])
        self.assertEqual({r["base"] for r in rows}, {"unknown"})

    def test_a_file_with_layer_roles_is_for_kills_py(self):
        done, *_ = self.ledger(format_2(PR_KILLS))
        self.assertEqual(done.returncode, 1)
        self.assertIn("read this one with kills.py --candidates <candidates file>", done.stderr)


if __name__ == "__main__":
    unittest.main()
