package com.metabase.corvus.api.tiles;

/**
 * Created by agilliland on 3/23/15.
 */
public class MapPoint {

    private final double x;
    private final double y;

    public MapPoint(double x, double y) {
        this.x = x;
        this.y = y;
    }


    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }
}
