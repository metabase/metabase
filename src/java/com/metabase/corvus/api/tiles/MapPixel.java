package com.metabase.corvus.api.tiles;

/**
 * Created by agilliland on 3/23/15.
 */
public class MapPixel {

    private final int x;
    private final int y;

    public MapPixel(int x, int y) {
        this.x = x;
        this.y = y;
    }


    public int getX() {
        return x;
    }

    public int getY() {
        return y;
    }
}
