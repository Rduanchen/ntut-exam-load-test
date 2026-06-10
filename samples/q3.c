#include <stdio.h>
#include <string.h>

typedef struct {
    int id;
    int hits;
    int bases_run;
} Player;

int main() {
    Player players[9];
    char actions[9][10];
    int action_counts[9];

    // 初始化與讀取輸入
    for (int i = 0; i < 9; i++) {
        players[i].id = i + 1;
        players[i].hits = 0;
        players[i].bases_run = 0;
        scanf("%d", &action_counts[i]);
        for (int j = 0; j < action_counts[i]; j++) {
            char act[5];
            scanf("%s", act);
            actions[i][j] = act[0];
        }
    }

    int target_outs;
    scanf("%d", &target_outs);

    int total_runs = 0, current_outs = 0;
    int bases[4] = {0}; // index 1~3 代表一二三壘的球員ID
    int batter_idx = 0;
    int act_idx[9] = {0};

    // 開始模擬
    while (current_outs < target_outs) {
        int pid = batter_idx + 1;
        if (act_idx[batter_idx] >= action_counts[batter_idx]) {
            batter_idx = (batter_idx + 1) % 9;
            continue;
        }
        
        char act = actions[batter_idx][act_idx[batter_idx]++];
        
        if (act == 'O') {
            current_outs++;
            if (current_outs % 3 == 0) {
                // 三出局清空壘包
                for (int i = 1; i <= 3; i++) bases[i] = 0;
            }
        } else {
            int advance = (act == 'H') ? 4 : (act - '0');
            players[batter_idx].hits++;
            
            // 壘上跑者移動
            for (int i = 3; i >= 1; i--) {
                if (bases[i] != 0) {
                    int runner_idx = bases[i] - 1;
                    int end_base = i + advance;
                    if (end_base > 3) {
                        players[runner_idx].bases_run += (4 - i);
                        total_runs++;
                    } else {
                        players[runner_idx].bases_run += advance;
                        bases[end_base] = bases[i];
                    }
                    bases[i] = 0;
                }
            }
            // 打者自己移動
            if (advance > 3) {
                players[batter_idx].bases_run += 4;
                total_runs++;
            } else {
                players[batter_idx].bases_run += advance;
                bases[advance] = pid;
            }
        }
        batter_idx = (batter_idx + 1) % 9;
    }

    // 排序打者跑壘數
    for (int i = 0; i < 8; i++) {
        for (int j = 0; j < 8 - i; j++) {
            if (players[j].bases_run < players[j+1].bases_run || 
               (players[j].bases_run == players[j+1].bases_run && players[j].id > players[j+1].id)) {
                Player temp = players[j];
                players[j] = players[j+1];
                players[j+1] = temp;
            }
        }
    }

    printf("%d\n", total_runs);
    for (int i = 0; i < 3; i++) {
        printf("%d %d %d\n", players[i].id, players[i].hits, players[i].bases_run);
    }

    return 0;
}