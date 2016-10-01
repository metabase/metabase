import {
    findElement,
    calculateCDF
} from 'metabase/lib/recommendations';

describe('recommendations', () => {
    describe('calculateCDF', () => {
        it('treates equal weights equally', () => {
            expect(
                calculateCDF([{result: "yay", weight: 20},
                              {result: "yay2", weight: 20}])
            ).toEqual(
                [0.5, 1]
            );
        });


        it('treates unequal weights unequally', () => {
            expect(
                calculateCDF([{result: "yay", weight: 20},
                              {result: "yay2", weight: 20},
                              {result: "yay3", weight: 40}])
            ).toEqual(
                [0.25, 0.5, 1]
            );
        });

    });

    describe('findElement', () => {
        it('returns the first index if there is only one element', () => {
            expect(
                findElement([1.0], 0)
            ).toEqual(
                0
            );
        });

        it('returns the first index if there is only one element pt 2', () => {
            expect(
                findElement([1.0], 0.5)
            ).toEqual(
                0
            );
        });


        it('returns the first index if there is only one element pt 3', () => {
            expect(
                findElement([1.0], 1.0)
            ).toEqual(
                0
            );
        });


        it('returns the first index if 0', () => {
            expect(
                findElement([0.1, 0.5, 1.0], 0)
            ).toEqual(
                0
            );
        });


        it('returns the last index if 1', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 1)
            ).toEqual(
                2
            );
        });


        it('returns the first index of an element with cummulativeProbability less than or equal to p', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 0.05)
            ).toEqual(
                0
            );
        });



        it('returns the first index of an element with cummulativeProbability less than or equal to p pt. 2 ', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 0.1)
            ).toEqual(
                0
            );
        });



        it('returns the first index of an element with cummulativeProbability less than or equal to p pt. 3 ', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 0.45)
            ).toEqual(
                1
            );
        });

        it('returns the first index of an element with cummulativeProbability less than or equal to p pt. 4 ', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 0.5)
            ).toEqual(
                1
            );
        });


        it('returns the first index of an element with cummulativeProbability less than or equal to p pt. 5 ', () => {
            expect(
                findElement([ 0.1, 0.5, 1.0], 0.55)
            ).toEqual(
                2
            );
        });

    });

});
