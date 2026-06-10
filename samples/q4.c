#include <stdio.h>
#include <string.h>

void parse(const char *expr, int *pos, int r, int c, int size, int grid[8][8]) {
    char ch = expr[(*pos)++];
    if (ch == '0') {
        for (int i = r; i < r + size; i++)
            for (int j = c; j < c + size; j++) grid[i][j] = 0;
    } else if (ch == '1') {
        for (int i = r; i < r + size; i++)
            for (int j = c; j < c + size; j++) grid[i][j] = 1;
    } else if (ch == '2') {
        int half = size / 2;
        parse(expr, pos, r, c, half, grid);               // 左上
        parse(expr, pos, r, c + half, half, grid);        // 右上
        parse(expr, pos, r + half, c, half, grid);        // 左下
        parse(expr, pos, r + half, c + half, half, grid); // 右下
    }
}

int main() {
    char expr[105];
    int n;
    while (scanf("%s %d", expr, &n) != EOF) {
        int grid[8][8] = {0};
        int pos = 0;
        parse(expr, &pos, 0, 0, n, grid);

        int all_black = 1;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                if (grid[i][j] == 0) all_black = 0;
            }
        }

        if (all_black) {
            printf("all black\n");
        } else {
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    if (grid[i][j] == 0) {
                        printf("%d,%d\n", i, j);
                    }
                }
            }
        }
    }
    return 0;
}