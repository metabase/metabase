import { formatNumber } from 'metabase/lib/formatting';

describe('formatting', () => {
    describe('formatNumber', () => {
        it('should format 0 correctly', () => {
            expect(formatNumber(0)).toEqual("0");
        });
        it('should format 1 and -1 correctly', () => {
            expect(formatNumber(1)).toEqual("1");
            expect(formatNumber(-1)).toEqual("-1");
        });
        it('should format large positive and negative numbers correctly', () => {
            expect(formatNumber(10)).toEqual("10");
            expect(formatNumber(99999999)).toEqual("99,999,999");
            expect(formatNumber(-10)).toEqual("-10");
            expect(formatNumber(-99999999)).toEqual("-99,999,999");
        });
        it('should format to 2 significant digits', () => {
            expect(formatNumber(1/3)).toEqual("0.33");
            expect(formatNumber(-1/3)).toEqual("-0.33");
            expect(formatNumber(0.0001/3)).toEqual("0.000033");
        });
    });
});
