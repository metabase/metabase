package com.stratio.metabase.executionfactory;

import java.util.HashSet;
import java.util.Set;

/**
 * Created by roman on 1/05/17.
 */
public class QueryExecutionFactory {

    private static Set<String> set;
    static {
        set = new HashSet<String>();
    }

    public static void executeSequentialQuery(byte[] hashQuery) throws InterruptedException {

        String sHashQuery = new String(hashQuery);
        boolean sequentialQuery = false;
        while (!sequentialQuery) {
            synchronized (set) {
                if (set.contains(sHashQuery)) {
                    set.wait(100);
                } else {
                    set.add(sHashQuery);
                    sequentialQuery=true;
                }
            }
        }
    }

    public static void queryExecuted(byte[] hashQuery) throws InterruptedException {
        String sHashQuery = new String(hashQuery);
        synchronized (set) {
            set.remove(sHashQuery);
            set.notify();
        }
    }

}
