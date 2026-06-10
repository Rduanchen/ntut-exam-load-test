#include <stdio.h>

// Helper functions (每個最多一個迴圈)
void print_chars(char c, int n) {
    for (int i = 0; i < n; i++) putchar(c);
}
void print_nums_up(int n) {
    for (int i = 1; i <= n; i++) printf("%d", i);
}
void print_nums_down(int n) {
    for (int i = n; i >= 1; i--) printf("%d", i);
}
void print_nums_up_from2(int n) {
    for (int i = 2; i <= n; i++) printf("%d", i);
}

// 圖形 1 的處理
void pattern1(int n) {
    for (int i = 1; i <= n; i++) { print_nums_up(i); putchar('\n'); }
    for (int i = n - 1; i >= 1; i--) { print_nums_down(i); putchar('\n'); }
}

// 圖形 2 的處理
void p2_line(int r, int n) {
    print_chars('_', n - r);
    print_nums_down(r);
    print_nums_up_from2(r);
    print_chars('_', n - r);
    putchar('\n');
}
void pattern2(int n) {
    for (int i = 1; i <= n; i++) p2_line(i, n);
    for (int i = n - 1; i >= 1; i--) p2_line(i, n);
}

// 圖形 3 的處理
void p3_line(int r, int n) {
    print_nums_up(r);
    print_nums_down(r - 1);
    print_chars('_', n - r);
    print_chars('_', n - r); // 補充右側底線
    putchar('\n');
}
void pattern3(int n) {
    for (int i = 1; i <= n; i++) p3_line(i, n);
}

// 圖形 4 的處理
void p4_line_top(int r, int n) {
    print_chars('_', r - 1);
    print_nums_up(n);
    print_chars('_', n - r);
    putchar('\n');
}
void p4_line_bottom(int r, int n) {
    print_chars('_', r - 1);
    print_nums_down(n);
    print_chars('_', n - r);
    putchar('\n');
}
void pattern4(int n) {
    for (int i = 1; i <= n; i++) {
        if (i % 2 != 0) p4_line_top(i, n);
        else p4_line_bottom(i, n);
    }
}

int main() {
    int type, n;
    while (scanf("%d %d", &type, &n) != EOF) {
        if (type == 1) pattern1(n);
        else if (type == 2) pattern2(n);
        else if (type == 3) pattern3(n);
        else if (type == 4) pattern4(n);
    }
    return 0;
}