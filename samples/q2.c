#include <stdio.h>

// 翻滾單一骰子
void roll(int *t, int *f, int *r, int op) {
    int ot = *t, of = *f, or_ = *r;
    if (op == 1)      { *t = 7 - of; *f = ot; }
    else if (op == 2) { *t = of; *f = 7 - ot; }
    else if (op == 3) { *t = 7 - or_; *r = ot; }
    else if (op == 4) { *t = or_; *r = 7 - ot; }
}

// 氣泡排序骰子點數 (輔助計分)
void sort_dice(int d[4]) {
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3 - i; j++) {
            if (d[j] > d[j+1]) {
                int temp = d[j]; d[j] = d[j+1]; d[j+1] = temp;
            }
        }
    }
}

// 計算 4 顆骰子得分
int get_score(int t1, int t2, int t3, int t4) {
    int d[4] = {t1, t2, t3, t4};
    sort_dice(d);
    if (d[0] == d[1] && d[1] == d[2] && d[2] == d[3]) return 0; // 四顆相同
    if (d[0] == d[2] || d[1] == d[3]) return 0;                 // 三顆相同
    if (d[0] == d[1] && d[2] == d[3]) return d[2] + d[3];       // 兩對，取大
    if (d[0] == d[1]) return d[2] + d[3];
    if (d[1] == d[2]) return d[0] + d[3];
    if (d[2] == d[3]) return d[0] + d[1];
    return 0; // 全不相同
}

int play_player(int times) {
    int tops[4] = {1, 1, 1, 1};
    int fronts[4] = {4, 4, 4, 4};
    int rights[4] = {2, 2, 2, 2};
    for (int i = 0; i < times; i++) {
        int ops[4];
        scanf("%d %d %d %d", &ops[0], &ops[1], &ops[2], &ops[3]);
        for (int j = 0; j < 4; j++) {
            roll(&tops[j], &fronts[j], &rights[j], ops[j]);
        }
    }
    return get_score(tops[0], tops[1], tops[2], tops[3]);
}

int main() {
    int ma;
    while (scanf("%d", &ma) != EOF) {
        int scoreA = play_player(ma);
        int mb;
        scanf("%d", &mb);
        int scoreB = play_player(mb);

        if (scoreA > scoreB) printf("A win\n");
        else if (scoreB > scoreA) printf("B win\n");
        else printf("Tie\n");
    }
    return 0;
}