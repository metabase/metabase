import { processCommit } from './release-log';

describe('Release Log', () => {
  describe('processCommit', () => {
    it('should return an array of commit info objects with versions', () => {
      const commitLine = 'tag: v1.50.0-RC2, tag: v0.50.0-RC2||Show the columns for the correct stage when using combine/extract in the presence of an aggregation (#43226) (#43450)||7a8b73e298e0d658e2fcd6b1fbcac3e0d0770288||Mon Jun 3 03:31';
      const result = processCommit(commitLine);
      expect(result).toEqual({
        versions: ['v1.50.0-RC2', 'v0.50.0-RC2'],
        message: 'Show the columns for the correct stage when using combine/extract in the presence of an aggregation (#43226) (#43450)',
        hash: '7a8b73e298e0d658e2fcd6b1fbcac3e0d0770288',
        date: 'Mon Jun 3 03:31',
      });
    });

    it('should return an empty string in an array when there are no tags', () => {
      const commitLine = '||fix stacked data labels on ordinal charts (#43469) (#43508)||37c901325cdf9cdb96091e4c159c849fd65df9f5||Mon Jun 3 11:03';
      const result = processCommit(commitLine);
      expect(result).toEqual({
        versions: [''],
        message: 'fix stacked data labels on ordinal charts (#43469) (#43508)',
        hash: '37c901325cdf9cdb96091e4c159c849fd65df9f5',
        date: 'Mon Jun 3 11:03',
      });
    });

    it('should gracefully handle malformed logs', () => {
      const commitLine = ' foo bar baz | la dee da pikachu;\r\n$20 ';
      const result = processCommit(commitLine);
      expect(result).toEqual({
        versions: [''],
        message: undefined,
        hash: undefined,
        date: undefined,
      });
    });

    it('should gracefully handle empty logs', () => {
      const commitLine = '';
      const result = processCommit(commitLine);
      expect(result).toEqual({
        versions: [''],
        message: undefined,
        hash: undefined,
        date: undefined,
      });
    });
  });
});
