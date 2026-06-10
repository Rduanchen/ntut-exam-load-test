#include <stdio.h>

// 自己實作絕對值，不引入 <stdlib.h> 避免 div() 函式名稱發生衝突
long long my_abs(long long x) {
    return x < 0 ? -x : x;
}

// 求最大公因數
long long gcd(long long a, long long b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}

// 分數化簡
void simplify(long long *n, long long *d) {
    if (*d == 0) return;
    if (*d < 0) { *n = -*n; *d = -*d; } // 確保負號在分子
    long long g = gcd(my_abs(*n), *d);
    *n /= g;
    *d /= g;
}

// 解析輸入的字串分數
void parse_frac(char *str, int *n, int *d) {
    long long a = 0, b = 0, c = 1;
    // 格式 1: 帶分數 例如 8(3/4) 或 -7(121/545)
    if (sscanf(str, "%lld(%lld/%lld)", &a, &b, &c) == 3) {
        *n = (a < 0) ? (int)(a * c - b) : (int)(a * c + b);
        *d = (int)c;
    } 
    // 格式 2: 真分數/假分數 例如 57/391
    else if (sscanf(str, "%lld/%lld", &a, &b) == 2) {
        *n = (int)a; 
        *d = (int)b;
    } 
    // 格式 3: 單純整數
    else {
        sscanf(str, "%lld", &a);
        *n = (int)a; 
        *d = 1;
    }
}

// 輸出分數
void print_frac(int num, int den) {
    if (den == 0) { 
        printf("error\n"); 
        return; 
    }
    
    long long n = num, d = den;
    simplify(&n, &d);
    
    if (n == 0) { 
        printf("0\n"); 
        return; 
    }
    
    long long whole = n / d;
    long long rem = my_abs(n % d);
    
    if (whole != 0 && rem != 0) {
        printf("%lld(%lld/%lld)\n", whole, rem, d);
    } else if (whole != 0 && rem == 0) {
        printf("%lld\n", whole);
    } else {
        if (n < 0) printf("-%lld/%lld\n", rem, d);
        else printf("%lld/%lld\n", rem, d);
    }
}

// ---------------- 依據題目規定宣告的運算 Function ----------------

void add(int *numer1, int *denom1, int *numer2, int *denom2, int *resNumer, int *resDenom) {
    long long num = (long long)*numer1 * (*denom2) + (long long)*numer2 * (*denom1);
    long long den = (long long)*denom1 * (*denom2);
    simplify(&num, &den); 
    *resNumer = (int)num; 
    *resDenom = (int)den;
}

void sub(int *numer1, int *denom1, int *numer2, int *denom2, int *resNumer, int *resDenom) {
    long long num = (long long)*numer1 * (*denom2) - (long long)*numer2 * (*denom1);
    long long den = (long long)*denom1 * (*denom2);
    simplify(&num, &den); 
    *resNumer = (int)num; 
    *resDenom = (int)den;
}

void mul(int *numer1, int *denom1, int *numer2, int *denom2, int *resNumer, int *resDenom) {
    long long num = (long long)*numer1 * (*numer2);
    long long den = (long long)*denom1 * (*denom2);
    simplify(&num, &den); 
    *resNumer = (int)num; 
    *resDenom = (int)den;
}

void div(int *numer1, int *denom1, int *numer2, int *denom2, int *resNumer, int *resDenom) {
    long long num = (long long)*numer1 * (*denom2);
    long long den = (long long)*denom1 * (*numer2);
    simplify(&num, &den); 
    *resNumer = (int)num; 
    *resDenom = (int)den;
}

// -----------------------------------------------------------------

int main() {
    char s1[50], s2[50];
    while (scanf("%s %s", s1, s2) != EOF) {
        int n1, d1, n2, d2, rn, rd;
        parse_frac(s1, &n1, &d1);
        parse_frac(s2, &n2, &d2);
        
        // 若任意一個輸入的分母為0，則四個運算都會是 error
        if (d1 == 0 || d2 == 0) {
            for(int i = 0; i < 4; i++) printf("error\n");
            continue;
        }

        // 1. 加法
        add(&n1, &d1, &n2, &d2, &rn, &rd); 
        print_frac(rn, rd);
        
        // 2. 減法
        sub(&n1, &d1, &n2, &d2, &rn, &rd); 
        print_frac(rn, rd);
        
        // 3. 乘法
        mul(&n1, &d1, &n2, &d2, &rn, &rd); 
        print_frac(rn, rd);
        
        // 4. 除法 (除法額外檢查第二個分數的分子是否為0)
        if (n2 == 0) { 
            printf("error\n"); 
        } else { 
            div(&n1, &d1, &n2, &d2, &rn, &rd); 
            print_frac(rn, rd); 
        }
    }
    return 0;
}