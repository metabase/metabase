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
            "qualifying_mutants", "qualifying_without_location")

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
    REPRO_35009: ("delete", "no unique kill"),
    BOOKMARKS: ("delete", "no unique kill"),
    UNIQUE: ("keep", "unique kills"),
    TWIN_POSTGRES: ("keep", COVER_KEEPS),
    TWIN_MYSQL: ("delete", "no unique kill"),
}


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
        confirmed_only = write_json({mid: {k: v for k, v in m.items() if k != "unconfirmed_by"} for mid, m in UNCONFIRMED_KILLS.items()})
        try:
            for min_mutants, strata, otherwise in ((1, [], "delete"), (kills.MIN_MUTANTS, STRATA, "unmeasured")):
                with self.subTest(otherwise):
                    by_file = {f: kills.evaluate(INDEX, f, [REPRO_69160], min_mutants, strata)["candidates"][REPRO_69160]["verdict"]
                               for f in (confirmed_only, self.kills_file)}
                    self.assertEqual(by_file, {confirmed_only: otherwise, self.kills_file: "provisional-keep"})
        finally:
            os.unlink(confirmed_only)

    def test_the_cover_keeps_every_candidate_with_an_unconfirmed_unique_kill(self):
        self.assertEqual(set(self.result["kills_cover"]["kept"]), {REPRO_69160, UNIQUE, TWIN_POSTGRES})

    def test_reports(self):
        summary = self.result["summary"]
        self.assertEqual(summary["verdicts"], {"keep": 2, "provisional-keep": 1, "delete": 3, "unmeasured": 0})
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
        self.assertEqual(outcomes(result, twins), [("delete", "no unique kill"), ("provisional-keep", COVER_KEEPS_UNCONFIRMED)])
        [kept] = result["kills_cover"]["kept"]
        self.assertEqual({t: result["candidates"][t]["cover_kept_for"] for t in twins},
                         {t: {"logic": ["twins"]} if t == kept else {} for t in twins})
        self.assertIn(f"\nProvisional-keep\n  {kept}\n      {COVER_KEEPS_UNCONFIRMED}\n      kept by the cover for logic twins\n",
                      kills.report(result))

    def test_one_of_three_candidates_that_share_only_an_unconfirmed_kill_is_kept(self):
        three = [BOOKMARKS, BOOKMARK_COLLECTION, BOOKMARK_MODEL]
        result = self.evaluate_alone({"three": mutant("state", [], three + [REMAINING], unconfirmed_by=three)}, three)
        self.assertEqual(outcomes(result, three), [("delete", "no unique kill")] * 2 + [("provisional-keep", COVER_KEEPS_UNCONFIRMED)])

    def test_a_twin_with_a_confirmed_kill_is_kept_over_a_twin_with_an_unconfirmed_one(self):
        twins = [TWIN_MYSQL, TWIN_POSTGRES]
        result = self.evaluate_alone(
            {"mix": mutant("logic", [TWIN_MYSQL], twins + [REMAINING], L_TWIN, unconfirmed_by=[TWIN_POSTGRES])}, twins)
        self.assertEqual(outcomes(result, [TWIN_MYSQL]), [("keep", "unique kills")])
        self.assertEqual(outcomes(result, [TWIN_POSTGRES]), [("delete", "no unique kill")])
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
