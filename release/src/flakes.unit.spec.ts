import type { FlakeData} from './flakes-helpers';
import { assignToTeam, countIssuesByTeam } from './flakes-helpers';
import type { Issue } from './types';

const createFlakeIssue = (data: Partial<FlakeData>): FlakeData => {
  return {
    test_name: '',
    suite_name: '',
    workflow_run_name: 'E2E Tests',
    workflow_job_name: '',
    max: '',
    max_2: '',
    count: 0,
    count_1d: 0,
    count_3d: 0,
    ...data,
  }
}

describe('flake issue creator', () => {
  describe('team assigner', () => {
    const testData: [Partial<FlakeData>, string][] = [
      [{ test_name: 'foo' }, '.Team/AdminWebapp'],
      [{ workflow_run_name: 'Driver Tests' }, '.Team/QueryProcessor'],
      [{ workflow_run_name: 'Backend' }, '.Team/BackendComponents'],
      [{ test_name: 'should fix all the viz problems' }, '.Team/DashViz'],
      [{ test_name: 'should make dashboards go vroom' }, '.Team/DashViz'],
      [{ test_name: 'questions should have data' }, '.Team/QueryingComponents'],
      [{ test_name: 'queries should finish in a reasonable amount of time' }, '.Team/QueryingComponents'],
      [{ test_name: 'collections should not delete themselves' }, '.Team/AdminWebapp'],
      [{ test_name: 'permissions should let people in' }, '.Team/AdminWebapp'],
    ];

    it.each(testData)('should assign the flake to the correct team: %s : %s', (data, team) => {
      expect(assignToTeam(createFlakeIssue(data))).toEqual(team);
    });
  });

  describe('countIssuesByTeam', () => {
    it('groups issues by team', () => {
      const testIssues = [
        { labels: [ { name: '.Team/a' }]},
        { labels: [ { name: '.Team/a' }]},
        { labels: [ { name: '.Team/b' }]},
        { labels: [ { name: '.Team/b' }]},
      ] as Issue[];

      const groupedIssues = countIssuesByTeam(testIssues);

      expect(groupedIssues).toEqual([
        ['.Team/a', 2],
        ['.Team/b', 2],
      ]);
    });

    it('sorts teams by most -> least issues', () => {
      const testIssues = [
        { labels: [ { name: '.Team/one' }]},
        { labels: [ { name: '.Team/two' }]},
        { labels: [ { name: '.Team/two' }]},
        { labels: [ { name: '.Team/three' }]},
        { labels: [ { name: '.Team/three' }]},
        { labels: [ { name: '.Team/three' }]},
      ] as Issue[];

      const groupedIssues = countIssuesByTeam(testIssues);

      expect(groupedIssues).toEqual([
        ['.Team/three', 3],
        ['.Team/two', 2],
        ['.Team/one', 1],
      ]);
    });

    it('classifies issues without a team tag as unknown', () => {
      const testIssues = [
        { labels: [ { name: '.Team/one' }]},
        { labels: [ { name: 'othertag' }]},
      ] as Issue[];

      const groupedIssues = countIssuesByTeam(testIssues);

      expect(groupedIssues).toEqual([
        ['.Team/one', 1],
        ['.Team/Unknown Team', 1]
      ]);
    });

    it('is unaffected by other non-team tags', () => {
      const testIssues = [
        { labels: [ { name: 'othertag' }, { name: '.Team/one' }]},
        { labels: [ { name: 'mytag' }, { name: '.Team/one' }]},
        { labels: [ { name: '.Team/two' }, { name: 'othertag' },]},
      ] as Issue[];

      const groupedIssues = countIssuesByTeam(testIssues);

      expect(groupedIssues).toEqual([
        ['.Team/one', 2],
        ['.Team/two', 1],
      ]);
    })
  });


})
