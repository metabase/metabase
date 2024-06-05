import type { FlakeData} from './flakes';
import { assignToTeam } from './flakes';

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
  })
})
